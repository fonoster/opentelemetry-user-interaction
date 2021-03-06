/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
import { isWrapped, InstrumentationBase } from '@opentelemetry/instrumentation';
import * as api from '@opentelemetry/api';
import { hrTime } from '@opentelemetry/core';
import { getElementXPath } from '@opentelemetry/sdk-trace-web';
import { AttributeNames } from './enums/AttributeNames';
var VERSION = "0.1.1";
var ZONE_CONTEXT_KEY = 'OT_ZONE_CONTEXT';
var EVENT_NAVIGATION_NAME = 'Navigation:';
var DEFAULT_EVENT_NAMES = ['click'];
function defaultShouldPreventSpanCreation() {
    return false;
}
/**
 * This class represents a UserInteraction plugin for auto instrumentation.
 * If zone.js is available then it patches the zone otherwise it patches
 * addEventListener of HTMLElement
 */
var UserInteractionInstrumentation = /** @class */ (function (_super) {
    __extends(UserInteractionInstrumentation, _super);
    function UserInteractionInstrumentation(config) {
        var _a;
        var _this = _super.call(this, '@opentelemetry/instrumentation-user-interaction', VERSION, config) || this;
        _this.component = 'user-interaction';
        _this.version = VERSION;
        _this.moduleName = _this.component;
        _this._spansData = new WeakMap();
        // for addEventListener/removeEventListener state
        _this._wrappedListeners = new WeakMap();
        // for event bubbling
        _this._eventsSpanMap = new WeakMap();
        _this._eventNames = new Set((_a = config === null || config === void 0 ? void 0 : config.eventNames) !== null && _a !== void 0 ? _a : DEFAULT_EVENT_NAMES);
        _this._shouldPreventSpanCreation =
            typeof (config === null || config === void 0 ? void 0 : config.shouldPreventSpanCreation) === 'function'
                ? config.shouldPreventSpanCreation
                : defaultShouldPreventSpanCreation;
        return _this;
    }
    UserInteractionInstrumentation.prototype.init = function () { };
    /**
     * This will check if last task was timeout and will save the time to
     * fix the user interaction when nothing happens
     * This timeout comes from xhr plugin which is needed to collect information
     * about last xhr main request from observer
     * @param task
     * @param span
     */
    UserInteractionInstrumentation.prototype._checkForTimeout = function (task, span) {
        var spanData = this._spansData.get(span);
        if (spanData) {
            if (task.source === 'setTimeout') {
                spanData.hrTimeLastTimeout = hrTime();
            }
            else if (task.source !== 'Promise.then' &&
                task.source !== 'setTimeout') {
                spanData.hrTimeLastTimeout = undefined;
            }
        }
    };
    /**
     * Controls whether or not to create a span, based on the event type.
     */
    UserInteractionInstrumentation.prototype._allowEventName = function (eventName) {
        return this._eventNames.has(eventName);
    };
    /**
     * Creates a new span
     * @param element
     * @param eventName
     */
    UserInteractionInstrumentation.prototype._createSpan = function (element, eventName, parentSpan) {
        var _a;
        var _b, _c, _d, _e;
        if (!(element instanceof HTMLElement)) {
            return undefined;
        }
        if (!element.getAttribute) {
            return undefined;
        }
        if (element.hasAttribute('disabled')) {
            return undefined;
        }
        if (!this._allowEventName(eventName)) {
            return undefined;
        }
        var xpath = getElementXPath(element, true);
        try {
            var span = this.tracer.startSpan(eventName, {
                attributes: (_a = {
                        id: element.getAttribute('id') || element.getAttribute('data-id') || ((_b = element.parentElement) === null || _b === void 0 ? void 0 : _b.getAttribute('data-id')) || '',
                        elementText: element.textContent || ((_c = element.parentElement) === null || _c === void 0 ? void 0 : _c.textContent) || '',
                        description: element.getAttribute('data-desc') || ((_d = element.parentElement) === null || _d === void 0 ? void 0 : _d.getAttribute('data-desc')) || '',
                        actionIntent: element.getAttribute('data-intent') || ((_e = element.parentElement) === null || _e === void 0 ? void 0 : _e.getAttribute('data-intent')) || ''
                    },
                    _a[AttributeNames.EVENT_TYPE] = eventName,
                    _a[AttributeNames.TARGET_ELEMENT] = element.tagName,
                    _a[AttributeNames.TARGET_XPATH] = xpath,
                    _a[AttributeNames.HTTP_URL] = window.location.href,
                    _a[AttributeNames.HTTP_USER_AGENT] = navigator.userAgent,
                    _a),
            }, parentSpan
                ? api.trace.setSpan(api.context.active(), parentSpan)
                : undefined);
            if (this._shouldPreventSpanCreation(eventName, element, span) === true) {
                return undefined;
            }
            this._spansData.set(span, {
                taskCount: 0,
            });
            return span;
        }
        catch (e) {
            api.diag.error(this.component, e);
        }
        return undefined;
    };
    /**
     * Decrement number of tasks that left in zone,
     * This is needed to be able to end span when no more tasks left
     * @param span
     */
    UserInteractionInstrumentation.prototype._decrementTask = function (span) {
        var spanData = this._spansData.get(span);
        if (spanData) {
            spanData.taskCount--;
            if (spanData.taskCount === 0) {
                this._tryToEndSpan(span, spanData.hrTimeLastTimeout);
            }
        }
    };
    /**
     * Return the current span
     * @param zone
     * @private
     */
    UserInteractionInstrumentation.prototype._getCurrentSpan = function (zone) {
        var context = zone.get(ZONE_CONTEXT_KEY);
        if (context) {
            return api.trace.getSpan(context);
        }
        return context;
    };
    /**
     * Increment number of tasks that are run within the same zone.
     *     This is needed to be able to end span when no more tasks left
     * @param span
     */
    UserInteractionInstrumentation.prototype._incrementTask = function (span) {
        var spanData = this._spansData.get(span);
        if (spanData) {
            spanData.taskCount++;
        }
    };
    /**
     * Returns true iff we should use the patched callback; false if it's already been patched
     */
    UserInteractionInstrumentation.prototype.addPatchedListener = function (on, type, listener, wrappedListener) {
        var listener2Type = this._wrappedListeners.get(listener);
        if (!listener2Type) {
            listener2Type = new Map();
            this._wrappedListeners.set(listener, listener2Type);
        }
        var element2patched = listener2Type.get(type);
        if (!element2patched) {
            element2patched = new Map();
            listener2Type.set(type, element2patched);
        }
        if (element2patched.has(on)) {
            return false;
        }
        element2patched.set(on, wrappedListener);
        return true;
    };
    /**
     * Returns the patched version of the callback (or undefined)
     */
    UserInteractionInstrumentation.prototype.removePatchedListener = function (on, type, listener) {
        var listener2Type = this._wrappedListeners.get(listener);
        if (!listener2Type) {
            return undefined;
        }
        var element2patched = listener2Type.get(type);
        if (!element2patched) {
            return undefined;
        }
        var patched = element2patched.get(on);
        if (patched) {
            element2patched.delete(on);
            if (element2patched.size === 0) {
                listener2Type.delete(type);
                if (listener2Type.size === 0) {
                    this._wrappedListeners.delete(listener);
                }
            }
        }
        return patched;
    };
    // utility method to deal with the Function|EventListener nature of addEventListener
    UserInteractionInstrumentation.prototype._invokeListener = function (listener, target, args) {
        if (typeof listener === 'function') {
            return listener.apply(target, args);
        }
        else {
            return listener.handleEvent(args[0]);
        }
    };
    /**
     * This patches the addEventListener of HTMLElement to be able to
     * auto instrument the click events
     * This is done when zone is not available
     */
    UserInteractionInstrumentation.prototype._patchAddEventListener = function () {
        var plugin = this;
        return function (original) {
            return function addEventListenerPatched(type, listener, useCapture) {
                // Forward calls with listener = null
                if (!listener) {
                    return original.call(this, type, listener, useCapture);
                }
                var once = typeof useCapture === 'object' && useCapture.once;
                var patchedListener = function () {
                    var _this = this;
                    var args = [];
                    for (var _i = 0; _i < arguments.length; _i++) {
                        args[_i] = arguments[_i];
                    }
                    var parentSpan;
                    var event = args[0];
                    var target = event === null || event === void 0 ? void 0 : event.target;
                    if (event) {
                        parentSpan = plugin._eventsSpanMap.get(event);
                    }
                    if (once) {
                        plugin.removePatchedListener(this, type, listener);
                    }
                    var span = plugin._createSpan(target, type, parentSpan);
                    if (span) {
                        if (event) {
                            plugin._eventsSpanMap.set(event, span);
                        }
                        return api.context.with(api.trace.setSpan(api.context.active(), span), function () {
                            var result = plugin._invokeListener(listener, _this, args);
                            // no zone so end span immediately
                            span.end();
                            return result;
                        });
                    }
                    else {
                        return plugin._invokeListener(listener, this, args);
                    }
                };
                if (plugin.addPatchedListener(this, type, listener, patchedListener)) {
                    return original.call(this, type, patchedListener, useCapture);
                }
            };
        };
    };
    /**
     * This patches the removeEventListener of HTMLElement to handle the fact that
     * we patched the original callbacks
     * This is done when zone is not available
     */
    UserInteractionInstrumentation.prototype._patchRemoveEventListener = function () {
        var plugin = this;
        return function (original) {
            return function removeEventListenerPatched(type, listener, useCapture) {
                var wrappedListener = plugin.removePatchedListener(this, type, listener);
                if (wrappedListener) {
                    return original.call(this, type, wrappedListener, useCapture);
                }
                else {
                    return original.call(this, type, listener, useCapture);
                }
            };
        };
    };
    /**
     * Most browser provide event listener api via EventTarget in prototype chain.
     * Exception to this is IE 11 which has it on the prototypes closest to EventTarget:
     *
     * * - has addEventListener in IE
     * ** - has addEventListener in all other browsers
     * ! - missing in IE
     *
     * HTMLElement -> Element -> Node * -> EventTarget **! -> Object
     * Document -> Node * -> EventTarget **! -> Object
     * Window * -> WindowProperties ! -> EventTarget **! -> Object
     */
    UserInteractionInstrumentation.prototype._getPatchableEventTargets = function () {
        return window.EventTarget
            ? [EventTarget.prototype]
            : [Node.prototype, Window.prototype];
    };
    /**
     * Patches the history api
     */
    UserInteractionInstrumentation.prototype._patchHistoryApi = function () {
        this._unpatchHistoryApi();
        this._wrap(history, 'replaceState', this._patchHistoryMethod());
        this._wrap(history, 'pushState', this._patchHistoryMethod());
        this._wrap(history, 'back', this._patchHistoryMethod());
        this._wrap(history, 'forward', this._patchHistoryMethod());
        this._wrap(history, 'go', this._patchHistoryMethod());
    };
    /**
     * Patches the certain history api method
     */
    UserInteractionInstrumentation.prototype._patchHistoryMethod = function () {
        var plugin = this;
        return function (original) {
            return function patchHistoryMethod() {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i] = arguments[_i];
                }
                var url = "" + location.pathname + location.hash + location.search;
                var result = original.apply(this, args);
                var urlAfter = "" + location.pathname + location.hash + location.search;
                if (url !== urlAfter) {
                    plugin._updateInteractionName(urlAfter);
                }
                return result;
            };
        };
    };
    /**
     * unpatch the history api methods
     */
    UserInteractionInstrumentation.prototype._unpatchHistoryApi = function () {
        if (isWrapped(history.replaceState))
            this._unwrap(history, 'replaceState');
        if (isWrapped(history.pushState))
            this._unwrap(history, 'pushState');
        if (isWrapped(history.back))
            this._unwrap(history, 'back');
        if (isWrapped(history.forward))
            this._unwrap(history, 'forward');
        if (isWrapped(history.go))
            this._unwrap(history, 'go');
    };
    /**
     * Updates interaction span name
     * @param url
     */
    UserInteractionInstrumentation.prototype._updateInteractionName = function (url) {
        var span = api.trace.getSpan(api.context.active());
        if (span && typeof span.updateName === 'function') {
            span.updateName(EVENT_NAVIGATION_NAME + " " + url);
        }
    };
    /**
     * Patches zone cancel task - this is done to be able to correctly
     * decrement the number of remaining tasks
     */
    UserInteractionInstrumentation.prototype._patchZoneCancelTask = function () {
        var plugin = this;
        return function (original) {
            return function patchCancelTask(task) {
                var currentZone = Zone.current;
                var currentSpan = plugin._getCurrentSpan(currentZone);
                if (currentSpan && plugin._shouldCountTask(task, currentZone)) {
                    plugin._decrementTask(currentSpan);
                }
                return original.call(this, task);
            };
        };
    };
    /**
     * Patches zone schedule task - this is done to be able to correctly
     * increment the number of tasks running within current zone but also to
     * save time in case of timeout running from xhr plugin when waiting for
     * main request from PerformanceResourceTiming
     */
    UserInteractionInstrumentation.prototype._patchZoneScheduleTask = function () {
        var plugin = this;
        return function (original) {
            return function patchScheduleTask(task) {
                var currentZone = Zone.current;
                var currentSpan = plugin._getCurrentSpan(currentZone);
                if (currentSpan && plugin._shouldCountTask(task, currentZone)) {
                    plugin._incrementTask(currentSpan);
                    plugin._checkForTimeout(task, currentSpan);
                }
                return original.call(this, task);
            };
        };
    };
    /**
     * Patches zone run task - this is done to be able to create a span when
     * user interaction starts
     * @private
     */
    UserInteractionInstrumentation.prototype._patchZoneRunTask = function () {
        var plugin = this;
        return function (original) {
            return function patchRunTask(task, applyThis, applyArgs) {
                var event = Array.isArray(applyArgs) && applyArgs[0] instanceof Event
                    ? applyArgs[0]
                    : undefined;
                var target = event === null || event === void 0 ? void 0 : event.target;
                var span;
                var activeZone = this;
                if (target) {
                    span = plugin._createSpan(target, task.eventName);
                    if (span) {
                        plugin._incrementTask(span);
                        return activeZone.run(function () {
                            try {
                                return api.context.with(api.trace.setSpan(api.context.active(), span), function () {
                                    var currentZone = Zone.current;
                                    task._zone = currentZone;
                                    return original.call(currentZone, task, applyThis, applyArgs);
                                });
                            }
                            finally {
                                plugin._decrementTask(span);
                            }
                        });
                    }
                }
                else {
                    span = plugin._getCurrentSpan(activeZone);
                }
                try {
                    return original.call(activeZone, task, applyThis, applyArgs);
                }
                finally {
                    if (span && plugin._shouldCountTask(task, activeZone)) {
                        plugin._decrementTask(span);
                    }
                }
            };
        };
    };
    /**
     * Decides if task should be counted.
     * @param task
     * @param currentZone
     * @private
     */
    UserInteractionInstrumentation.prototype._shouldCountTask = function (task, currentZone) {
        if (task._zone) {
            currentZone = task._zone;
        }
        if (!currentZone || !task.data || task.data.isPeriodic) {
            return false;
        }
        var currentSpan = this._getCurrentSpan(currentZone);
        if (!currentSpan) {
            return false;
        }
        if (!this._spansData.get(currentSpan)) {
            return false;
        }
        return task.type === 'macroTask' || task.type === 'microTask';
    };
    /**
     * Will try to end span when such span still exists.
     * @param span
     * @param endTime
     * @private
     */
    UserInteractionInstrumentation.prototype._tryToEndSpan = function (span, endTime) {
        if (span) {
            var spanData = this._spansData.get(span);
            if (spanData) {
                span.end(endTime);
                this._spansData.delete(span);
            }
        }
    };
    /**
     * implements enable function
     */
    UserInteractionInstrumentation.prototype.enable = function () {
        var _this = this;
        var ZoneWithPrototype = this.getZoneWithPrototype();
        api.diag.debug('applying patch to', this.moduleName, this.version, 'zone:', !!ZoneWithPrototype);
        if (ZoneWithPrototype) {
            if (isWrapped(ZoneWithPrototype.prototype.runTask)) {
                this._unwrap(ZoneWithPrototype.prototype, 'runTask');
                api.diag.debug('removing previous patch from method runTask');
            }
            if (isWrapped(ZoneWithPrototype.prototype.scheduleTask)) {
                this._unwrap(ZoneWithPrototype.prototype, 'scheduleTask');
                api.diag.debug('removing previous patch from method scheduleTask');
            }
            if (isWrapped(ZoneWithPrototype.prototype.cancelTask)) {
                this._unwrap(ZoneWithPrototype.prototype, 'cancelTask');
                api.diag.debug('removing previous patch from method cancelTask');
            }
            this._zonePatched = true;
            this._wrap(ZoneWithPrototype.prototype, 'runTask', this._patchZoneRunTask());
            this._wrap(ZoneWithPrototype.prototype, 'scheduleTask', this._patchZoneScheduleTask());
            this._wrap(ZoneWithPrototype.prototype, 'cancelTask', this._patchZoneCancelTask());
        }
        else {
            this._zonePatched = false;
            var targets = this._getPatchableEventTargets();
            targets.forEach(function (target) {
                if (isWrapped(target.addEventListener)) {
                    _this._unwrap(target, 'addEventListener');
                    api.diag.debug('removing previous patch from method addEventListener');
                }
                if (isWrapped(target.removeEventListener)) {
                    _this._unwrap(target, 'removeEventListener');
                    api.diag.debug('removing previous patch from method removeEventListener');
                }
                _this._wrap(target, 'addEventListener', _this._patchAddEventListener());
                _this._wrap(target, 'removeEventListener', _this._patchRemoveEventListener());
            });
        }
        this._patchHistoryApi();
    };
    /**
     * implements unpatch function
     */
    UserInteractionInstrumentation.prototype.disable = function () {
        var _this = this;
        var ZoneWithPrototype = this.getZoneWithPrototype();
        api.diag.debug('removing patch from', this.moduleName, this.version, 'zone:', !!ZoneWithPrototype);
        if (ZoneWithPrototype && this._zonePatched) {
            if (isWrapped(ZoneWithPrototype.prototype.runTask)) {
                this._unwrap(ZoneWithPrototype.prototype, 'runTask');
            }
            if (isWrapped(ZoneWithPrototype.prototype.scheduleTask)) {
                this._unwrap(ZoneWithPrototype.prototype, 'scheduleTask');
            }
            if (isWrapped(ZoneWithPrototype.prototype.cancelTask)) {
                this._unwrap(ZoneWithPrototype.prototype, 'cancelTask');
            }
        }
        else {
            var targets = this._getPatchableEventTargets();
            targets.forEach(function (target) {
                if (isWrapped(target.addEventListener)) {
                    _this._unwrap(target, 'addEventListener');
                }
                if (isWrapped(target.removeEventListener)) {
                    _this._unwrap(target, 'removeEventListener');
                }
            });
        }
        this._unpatchHistoryApi();
    };
    /**
     * returns Zone
     */
    UserInteractionInstrumentation.prototype.getZoneWithPrototype = function () {
        var _window = window;
        return _window.Zone;
    };
    return UserInteractionInstrumentation;
}(InstrumentationBase));
export { UserInteractionInstrumentation };
//# sourceMappingURL=instrumentation.js.map