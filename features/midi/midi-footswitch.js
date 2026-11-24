/* ==============================================================================
 * Mellow Chords — MIDI Footswitch Hook & Core Engine
 * Zero-Build Vanilla ES6+ Classic Browser Script (IIFE)
 * Exposes: window.MellowMidi
 * ============================================================================== */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'mellowchords.midi.settings.v1';
  var MAX_EVENT_LOG = 10;
  var MIN_DEBOUNCE_MS = 100;
  var MAX_DEBOUNCE_MS = 1000;

  var DEFAULT_CONFIG = Object.freeze({
    enabled: true,
    deviceId: 'all',
    debounceMs: 350,
    mappings: Object.freeze({
      nextSong: Object.freeze({ type: 'cc', channel: 1, number: 64 }),
      prevSong: Object.freeze({ type: 'cc', channel: 1, number: 65 })
    })
  });

  function clamp(num, min, max, fallback) {
    var parsed = Number(num);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

  function cloneMapping(mapping) {
    if (!mapping || typeof mapping !== 'object') {
      return null;
    }
    var type = String(mapping.type || '').toLowerCase();
    if (type !== 'cc' && type !== 'pc' && type !== 'note') {
      return null;
    }
    var channel = mapping.channel === 'any' || mapping.channel === 0 || mapping.channel === '0'
      ? 0
      : clamp(mapping.channel, 1, 16, 1);
    var number = clamp(mapping.number, 0, 127, 0);
    return {
      type: type,
      channel: channel,
      number: number
    };
  }

  function cloneDefaultConfig(debounceOverride) {
    var defaultDebounce = debounceOverride !== undefined
      ? clamp(debounceOverride, MIN_DEBOUNCE_MS, MAX_DEBOUNCE_MS, DEFAULT_CONFIG.debounceMs)
      : DEFAULT_CONFIG.debounceMs;

    return {
      enabled: DEFAULT_CONFIG.enabled,
      deviceId: DEFAULT_CONFIG.deviceId,
      debounceMs: defaultDebounce,
      mappings: {
        nextSong: cloneMapping(DEFAULT_CONFIG.mappings.nextSong),
        prevSong: cloneMapping(DEFAULT_CONFIG.mappings.prevSong)
      }
    };
  }

  function normalizeConfig(raw, debounceOverride) {
    var base = cloneDefaultConfig(debounceOverride);
    if (!raw || typeof raw !== 'object') {
      return base;
    }
    if (typeof raw.enabled === 'boolean') {
      base.enabled = raw.enabled;
    }
    if (typeof raw.deviceId === 'string' && raw.deviceId.trim()) {
      base.deviceId = raw.deviceId.trim();
    }
    if (raw.debounceMs !== undefined) {
      base.debounceMs = clamp(raw.debounceMs, MIN_DEBOUNCE_MS, MAX_DEBOUNCE_MS, base.debounceMs);
    }
    if (raw.mappings && typeof raw.mappings === 'object') {
      if (Object.prototype.hasOwnProperty.call(raw.mappings, 'nextSong')) {
        base.mappings.nextSong = raw.mappings.nextSong === null ? null : cloneMapping(raw.mappings.nextSong);
      }
      if (Object.prototype.hasOwnProperty.call(raw.mappings, 'prevSong')) {
        base.mappings.prevSong = raw.mappings.prevSong === null ? null : cloneMapping(raw.mappings.prevSong);
      }
    }
    return base;
  }

  function loadStoredConfig(debounceOverride) {
    try {
      if (typeof localStorage === 'undefined') {
        return cloneDefaultConfig(debounceOverride);
      }
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return cloneDefaultConfig(debounceOverride);
      }
      var parsed = JSON.parse(raw);
      return normalizeConfig(parsed, debounceOverride);
    } catch (err) {
      return cloneDefaultConfig(debounceOverride);
    }
  }

  function saveStoredConfig(config) {
    try {
      if (typeof localStorage === 'undefined') {
        return false;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Parses a 2- or 3-byte MIDI message (Uint8Array or numeric Array).
   * Supports Control Change (0xB0), Program Change (0xC0), and Note On (0x90).
   * Returns null for unsupported or System Common / Realtime messages (0xF0-0xFF).
   */
  function parseMidiMessage(data) {
    if (!data || typeof data.length !== 'number' || data.length < 2) {
      return null;
    }
    var status = data[0] & 0xFF;
    if (status >= 0xF0 || status < 0x80) {
      return null;
    }

    var command = status & 0xF0;
    var channel = (status & 0x0F) + 1;
    var data1 = data[1] & 0x7F;
    var data2 = data.length >= 3 ? (data[2] & 0x7F) : 0;

    if (command === 0xB0) {
      if (data.length < 3) {
        return null;
      }
      return {
        type: 'cc',
        channel: channel,
        number: data1,
        value: data2,
        isTrigger: data2 >= 64
      };
    }

    if (command === 0xC0) {
      return {
        type: 'pc',
        channel: channel,
        number: data1,
        value: 127,
        isTrigger: true
      };
    }

    if (command === 0x90) {
      if (data.length < 3) {
        return null;
      }
      return {
        type: 'note',
        channel: channel,
        number: data1,
        value: data2,
        isTrigger: data2 > 0
      };
    }

    return null;
  }

  /**
   * Encodes a structured MIDI event into a Uint8Array for simulation/testing.
   */
  function encodeMidiMessage(spec) {
    if (!spec || typeof spec !== 'object') {
      return null;
    }
    var type = String(spec.type || 'cc').toLowerCase();
    var channel = clamp(spec.channel === 0 || spec.channel === 'any' ? 1 : spec.channel, 1, 16, 1);
    var number = clamp(spec.number, 0, 127, 0);
    var value = clamp(spec.value !== undefined ? spec.value : 127, 0, 127, 127);
    var chNibble = (channel - 1) & 0x0F;

    if (type === 'cc') {
      return new Uint8Array([0xB0 | chNibble, number, value]);
    }
    if (type === 'pc') {
      return new Uint8Array([0xC0 | chNibble, number]);
    }
    if (type === 'note') {
      return new Uint8Array([0x90 | chNibble, number, value]);
    }
    return null;
  }

  /**
   * Formats a MIDI mapping or parsed MIDI event into a readable badge label.
   */
  function formatMidiMapping(mapping) {
    if (!mapping || typeof mapping !== 'object' || !mapping.type || typeof mapping.number !== 'number') {
      return 'ยังไม่ได้ตั้งค่า';
    }
    var type = String(mapping.type).toLowerCase();
    var prefix = type === 'cc' ? 'CC' : (type === 'pc' ? 'PC' : (type === 'note' ? 'Note' : ''));
    if (!prefix) {
      return 'ยังไม่ได้ตั้งค่า';
    }
    var chLabel = (mapping.channel === 0 || mapping.channel === 'any' || mapping.channel === null || mapping.channel === undefined)
      ? 'All Ch'
      : 'Ch ' + mapping.channel;
    return prefix + ' #' + mapping.number + ' (' + chLabel + ')';
  }

  /**
   * Checks whether a parsed MIDI event matches a stored mapping.
   * Supports channel === 0 or 'any' as a wildcard channel.
   */
  function matchesMapping(event, mapping) {
    if (!event || !mapping || !event.type || !mapping.type) {
      return false;
    }
    if (String(event.type).toLowerCase() !== String(mapping.type).toLowerCase()) {
      return false;
    }
    if (Number(event.number) !== Number(mapping.number)) {
      return false;
    }
    if (mapping.channel === 0 || mapping.channel === 'any' || mapping.channel === null || mapping.channel === undefined) {
      return true;
    }
    return Number(event.channel) === Number(mapping.channel);
  }

  /**
   * Creates a MIDI Footswitch controller with Web MIDI API support, MIDI Learn,
   * debounce protection, event log, simulator, and pub/sub state notifications.
   */
  function useMidiFootswitch(options) {
    var opts = options && typeof options === 'object' ? options : {};
    var config = loadStoredConfig(opts.debounceMs);

    var callbacks = {
      onNextSong: typeof opts.onNextSong === 'function' ? opts.onNextSong : null,
      onPrevSong: typeof opts.onPrevSong === 'function' ? opts.onPrevSong : null,
      onStatusChange: typeof opts.onStatusChange === 'function' ? opts.onStatusChange : null,
      onMidiEvent: typeof opts.onMidiEvent === 'function' ? opts.onMidiEvent : null
    };

    var midiAccess = null;
    var boundInputs = [];
    var devices = [];
    var status = 'idle'; // 'idle' | 'unsupported' | 'denied' | 'disconnected' | 'connected'
    var errorMessage = null;
    var learningAction = null;
    var learnCallback = null;
    var eventLog = [];
    var listeners = new Set();

    var lastActionAt = {
      nextSong: 0,
      prevSong: 0
    };
    var lastGlobalTriggerAt = 0;
    var destroyed = false;

    function cloneConfigSnapshot() {
      return {
        enabled: config.enabled,
        deviceId: config.deviceId,
        debounceMs: config.debounceMs,
        mappings: {
          nextSong: config.mappings.nextSong ? Object.assign({}, config.mappings.nextSong) : null,
          prevSong: config.mappings.prevSong ? Object.assign({}, config.mappings.prevSong) : null
        }
      };
    }

    function getState() {
      return {
        status: status,
        error: errorMessage,
        supported: typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function',
        devices: devices.map(function (d) { return Object.assign({}, d); }),
        connectedCount: devices.filter(function (d) { return d.state === 'connected'; }).length,
        learningAction: learningAction,
        config: cloneConfigSnapshot(),
        eventLog: eventLog.map(function (entry) {
          return {
            timestamp: entry.timestamp,
            event: entry.event ? Object.assign({}, entry.event) : null,
            matchedAction: entry.matchedAction,
            simulated: entry.simulated,
            debounced: entry.debounced,
            deviceName: entry.deviceName
          };
        })
      };
    }

    function notifySubscribers() {
      if (destroyed) {
        return;
      }
      var snapshot = getState();
      listeners.forEach(function (fn) {
        try {
          fn(snapshot);
        } catch (err) {
          // Isolate subscriber errors so one broken UI listener cannot break MIDI handling
        }
      });
    }

    function setStatus(nextStatus, errMsg) {
      var prevStatus = status;
      status = nextStatus;
      errorMessage = errMsg || null;
      if (prevStatus !== nextStatus && callbacks.onStatusChange) {
        try {
          callbacks.onStatusChange(nextStatus, getState());
        } catch (err) {
          // Ignore callback error
        }
      }
    }

    function pushEventLog(entry) {
      eventLog.unshift(entry);
      if (eventLog.length > MAX_EVENT_LOG) {
        eventLog.length = MAX_EVENT_LOG;
      }
    }

    function unbindInputs() {
      for (var i = 0; i < boundInputs.length; i++) {
        try {
          boundInputs[i].onmidimessage = null;
        } catch (err) {
          // Ignore detachment errors
        }
      }
      boundInputs = [];
    }

    function findMatchedAction(event) {
      var keys = ['nextSong', 'prevSong'];
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (config.mappings[key] && matchesMapping(event, config.mappings[key])) {
          return key;
        }
      }
      return null;
    }

    function handleMidiBytes(data, meta) {
      if (destroyed) {
        return { ignored: true, reason: 'destroyed' };
      }
      var info = meta || {};
      var simulated = Boolean(info.simulated);
      var deviceId = info.deviceId || (simulated ? 'simulator' : 'unknown');
      var deviceName = info.deviceName || (simulated ? 'Simulator' : 'MIDI Input');

      var event = parseMidiMessage(data);
      if (!event) {
        return { ignored: true, reason: 'unsupported_message' };
      }

      if (!simulated && config.deviceId !== 'all' && config.deviceId !== deviceId) {
        return { ignored: true, reason: 'device_filtered', event: event };
      }

      if (!event.isTrigger) {
        return { ignored: true, reason: 'not_trigger', event: event };
      }

      var now = Date.now();

      // MIDI Learn Mode captures the next trigger without firing song navigation
      if (learningAction) {
        var targetAction = learningAction;
        var doneCb = learnCallback;
        var learnedMapping = {
          type: event.type,
          channel: event.channel,
          number: event.number
        };

        config.mappings[targetAction] = learnedMapping;
        saveStoredConfig(config);
        learningAction = null;
        learnCallback = null;

        var learnEntry = {
          timestamp: now,
          event: event,
          matchedAction: 'learn:' + targetAction,
          simulated: simulated,
          debounced: false,
          deviceName: deviceName
        };
        pushEventLog(learnEntry);

        if (callbacks.onMidiEvent) {
          try {
            callbacks.onMidiEvent(learnEntry);
          } catch (err) {
            // Ignore callback error
          }
        }
        if (typeof doneCb === 'function') {
          try {
            doneCb(Object.assign({}, learnedMapping), targetAction, event);
          } catch (err) {
            // Ignore callback error
          }
        }
        notifySubscribers();
        return {
          learned: true,
          action: targetAction,
          mapping: learnedMapping,
          event: event
        };
      }

      var matchedAction = config.enabled ? findMatchedAction(event) : null;
      var debounced = false;

      if (matchedAction) {
        var elapsedAction = now - (lastActionAt[matchedAction] || 0);
        var elapsedGlobal = now - lastGlobalTriggerAt;
        if (elapsedAction < config.debounceMs || elapsedGlobal < config.debounceMs) {
          debounced = true;
        } else {
          lastActionAt[matchedAction] = now;
          lastGlobalTriggerAt = now;
        }
      }

      var logEntry = {
        timestamp: now,
        event: event,
        matchedAction: matchedAction,
        simulated: simulated,
        debounced: debounced,
        deviceName: deviceName
      };
      pushEventLog(logEntry);

      if (callbacks.onMidiEvent) {
        try {
          callbacks.onMidiEvent(logEntry);
        } catch (err) {
          // Ignore callback error
        }
      }

      if (matchedAction && !debounced) {
        if (matchedAction === 'nextSong' && callbacks.onNextSong) {
          try {
            callbacks.onNextSong(event, logEntry);
          } catch (err) {
            // Ignore callback error
          }
        } else if (matchedAction === 'prevSong' && callbacks.onPrevSong) {
          try {
            callbacks.onPrevSong(event, logEntry);
          } catch (err) {
            // Ignore callback error
          }
        }
      }

      notifySubscribers();
      return {
        matchedAction: matchedAction,
        debounced: debounced,
        event: event,
        simulated: simulated
      };
    }

    function refreshDevices() {
      if (destroyed) {
        return getState();
      }
      if (!midiAccess) {
        if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
          setStatus('unsupported');
        }
        notifySubscribers();
        return getState();
      }

      unbindInputs();
      var nextDevices = [];

      if (midiAccess.inputs && typeof midiAccess.inputs.forEach === 'function') {
        midiAccess.inputs.forEach(function (input) {
          var deviceInfo = {
            id: input.id,
            name: input.name || 'MIDI Device',
            manufacturer: input.manufacturer || '',
            state: input.state || 'connected',
            connection: input.connection || 'open'
          };
          nextDevices.push(deviceInfo);

          input.onmidimessage = function (msgEvent) {
            handleMidiBytes(msgEvent && msgEvent.data, {
              deviceId: input.id,
              deviceName: deviceInfo.name,
              simulated: false
            });
          };
          boundInputs.push(input);
        });
      }

      devices = nextDevices;
      var connectedCount = devices.filter(function (d) { return d.state === 'connected'; }).length;
      setStatus(connectedCount > 0 ? 'connected' : 'disconnected');
      notifySubscribers();
      return getState();
    }

    function init() {
      if (destroyed) {
        return Promise.resolve(getState());
      }
      if (typeof navigator === 'undefined' || typeof navigator.requestMIDIAccess !== 'function') {
        setStatus('unsupported', 'เบราว์เซอร์นี้ไม่รองรับ Web MIDI API');
        notifySubscribers();
        return Promise.resolve(getState());
      }

      try {
        return navigator.requestMIDIAccess({ sysex: false }).then(function (access) {
          if (destroyed) {
            return getState();
          }
          midiAccess = access;
          midiAccess.onstatechange = function () {
            refreshDevices();
          };
          return refreshDevices();
        }).catch(function (err) {
          if (destroyed) {
            return getState();
          }
          var msg = err && err.message ? err.message : 'ไม่ได้รับอนุญาตให้เข้าถึงอุปกรณ์ MIDI';
          setStatus('denied', msg);
          notifySubscribers();
          return getState();
        });
      } catch (err) {
        setStatus('denied', err && err.message ? err.message : 'ไม่สามารถเชื่อมต่อ Web MIDI API ได้');
        notifySubscribers();
        return Promise.resolve(getState());
      }
    }

    function getConfig() {
      return cloneConfigSnapshot();
    }

    function updateConfig(partial) {
      if (!partial || typeof partial !== 'object') {
        return getConfig();
      }
      if (typeof partial.enabled === 'boolean') {
        config.enabled = partial.enabled;
      }
      if (typeof partial.deviceId === 'string' && partial.deviceId.trim()) {
        config.deviceId = partial.deviceId.trim();
      }
      if (partial.debounceMs !== undefined) {
        config.debounceMs = clamp(partial.debounceMs, MIN_DEBOUNCE_MS, MAX_DEBOUNCE_MS, config.debounceMs);
      }
      if (partial.mappings && typeof partial.mappings === 'object') {
        if (Object.prototype.hasOwnProperty.call(partial.mappings, 'nextSong')) {
          config.mappings.nextSong = partial.mappings.nextSong === null
            ? null
            : cloneMapping(partial.mappings.nextSong);
        }
        if (Object.prototype.hasOwnProperty.call(partial.mappings, 'prevSong')) {
          config.mappings.prevSong = partial.mappings.prevSong === null
            ? null
            : cloneMapping(partial.mappings.prevSong);
        }
      }
      saveStoredConfig(config);
      notifySubscribers();
      return getConfig();
    }

    function setMapping(actionKey, mapping) {
      if (actionKey !== 'nextSong' && actionKey !== 'prevSong') {
        return getConfig();
      }
      config.mappings[actionKey] = mapping === null ? null : cloneMapping(mapping);
      saveStoredConfig(config);
      notifySubscribers();
      return getConfig();
    }

    function clearMapping(actionKey) {
      if (actionKey !== 'nextSong' && actionKey !== 'prevSong') {
        return getConfig();
      }
      config.mappings[actionKey] = null;
      if (learningAction === actionKey) {
        learningAction = null;
        learnCallback = null;
      }
      saveStoredConfig(config);
      notifySubscribers();
      return getConfig();
    }

    function resetConfig() {
      config = cloneDefaultConfig();
      learningAction = null;
      learnCallback = null;
      saveStoredConfig(config);
      notifySubscribers();
      return getConfig();
    }

    function startLearn(actionKey, onLearned) {
      if (actionKey !== 'nextSong' && actionKey !== 'prevSong') {
        return false;
      }
      learningAction = actionKey;
      learnCallback = typeof onLearned === 'function' ? onLearned : null;
      notifySubscribers();
      return true;
    }

    function cancelLearn() {
      if (!learningAction) {
        return false;
      }
      learningAction = null;
      learnCallback = null;
      notifySubscribers();
      return true;
    }

    function simulateMidiEvent(spec) {
      var bytes = encodeMidiMessage(spec);
      if (!bytes) {
        return { ignored: true, reason: 'invalid_simulation_spec' };
      }
      return handleMidiBytes(bytes, {
        deviceId: 'simulator',
        deviceName: 'Simulator',
        simulated: true
      });
    }

    function simulateAction(actionKey) {
      if (actionKey !== 'nextSong' && actionKey !== 'prevSong') {
        return { ignored: true, reason: 'unknown_action' };
      }
      var mapping = config.mappings[actionKey] || DEFAULT_CONFIG.mappings[actionKey];
      if (!mapping) {
        return { ignored: true, reason: 'no_mapping' };
      }
      var channel = (mapping.channel === 0 || mapping.channel === 'any') ? 1 : mapping.channel;
      return simulateMidiEvent({
        type: mapping.type,
        channel: channel,
        number: mapping.number,
        value: 127
      });
    }

    function setCallbacks(nextCallbacks) {
      if (!nextCallbacks || typeof nextCallbacks !== 'object') {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(nextCallbacks, 'onNextSong')) {
        callbacks.onNextSong = typeof nextCallbacks.onNextSong === 'function' ? nextCallbacks.onNextSong : null;
      }
      if (Object.prototype.hasOwnProperty.call(nextCallbacks, 'onPrevSong')) {
        callbacks.onPrevSong = typeof nextCallbacks.onPrevSong === 'function' ? nextCallbacks.onPrevSong : null;
      }
      if (Object.prototype.hasOwnProperty.call(nextCallbacks, 'onStatusChange')) {
        callbacks.onStatusChange = typeof nextCallbacks.onStatusChange === 'function' ? nextCallbacks.onStatusChange : null;
      }
      if (Object.prototype.hasOwnProperty.call(nextCallbacks, 'onMidiEvent')) {
        callbacks.onMidiEvent = typeof nextCallbacks.onMidiEvent === 'function' ? nextCallbacks.onMidiEvent : null;
      }
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') {
        return function () {};
      }
      listeners.add(listener);
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    function destroy() {
      destroyed = true;
      unbindInputs();
      if (midiAccess) {
        try {
          midiAccess.onstatechange = null;
        } catch (err) {
          // Ignore
        }
        midiAccess = null;
      }
      learningAction = null;
      learnCallback = null;
      listeners.clear();
    }

    return {
      init: init,
      refreshDevices: refreshDevices,
      destroy: destroy,
      getState: getState,
      getConfig: getConfig,
      updateConfig: updateConfig,
      setMapping: setMapping,
      clearMapping: clearMapping,
      resetConfig: resetConfig,
      startLearn: startLearn,
      cancelLearn: cancelLearn,
      simulateMidiEvent: simulateMidiEvent,
      simulateAction: simulateAction,
      setCallbacks: setCallbacks,
      subscribe: subscribe
    };
  }

  var ns = root.MellowMidi || (root.MellowMidi = {});
  ns.STORAGE_KEY = STORAGE_KEY;
  ns.DEFAULT_CONFIG = DEFAULT_CONFIG;
  ns.parseMidiMessage = parseMidiMessage;
  ns.encodeMidiMessage = encodeMidiMessage;
  ns.formatMidiMapping = formatMidiMapping;
  ns.matchesMapping = matchesMapping;
  ns.useMidiFootswitch = useMidiFootswitch;
})(typeof window !== 'undefined' ? window : globalThis);
