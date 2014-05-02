(function () {

  'use strict';


  // Scope Variables
  // ---------------


  // Reference to the head of the document where `hiddenRules` are inserted.
  var head = document.getElementsByTagName('head')[0];

  // The rules used to hide elements during the ready lifecycle callback.
  var hiddenRules = document.createElement('style');

  // The classname used to emulate element visibility between ready / insert.
  var classname = '_skate';

  // Element.prototype.matches polyfill as a function.
  var matchesSelector = (function () {
      var matcher = Element.prototype.matches;

      ['moz', 'ms', 'o', 'webkit'].some(function (prefix) {
        var method = prefix + 'MatchesSelector';

        if (Element.prototype[method]) {
          matcher = method;
          return true;
        }
      });

      return function (element, selector) {
        return element && element.nodeType === 1 && element[matcher](selector);
      };
    }());

  // All active instances.
  var skates = [];

  // The adapter we are using according to the capabilities of the environment.
  var skateAdapter = mutationObserverAdapter() || mutationEventAdapter();

  // The property to use when checking if the element has already been initialised.
  var isReadyTriggeredProperty = '_skate_ready_triggered';

  // The property to use when checking if the element's insert callback has been executed.
  var isInsertTriggeredProperty = '_skate_insert_triggered';


  // Factory
  // -------

  function skate (id, component) {
    // The listener is what controls the lifecycle of the element.
    var listener = new Skate(id, component);

    // For easy instantiation.
    var constructor = function () {
      var element = document.createElement(id);
      listener.init(element);
      return element;
    };

    // If you need access to the listener.
    constructor.listener = listener;

    // The skate factory returns the element constructor.
    return constructor;
  }

  // Restriction type constants.
  skate.types = {
    ANY: 'act',
    ATTR: 'a',
    CLASS: 'c',
    NOATTR: 'ct',
    NOCLASS: 'at',
    NOTAG: 'ac',
    TAG: 't'
  };

  // Default configuration.
  skate.defaults = {
    // Set to `{...}` of `attrName: `{ init: ..., update: ..., remove: ... }` to listen to specific attributes.
    attributes: false,

    // Properties and methods to add to each element.
    extend: {},

    // Whether or not to start listening right away.
    listen: true,

    // The type of bindings to allow.
    type: skate.types.ANY
  };

  // Initialises the elements against all skate instances.
  skate.init = function (elements) {
    eachElement(elements, function (element) {
      skate.listeners(element).forEach(function (listener) {
        listener.init(element);
      });
    });

    return elements;
  };

  // Destroys all active instances.
  skate.destroy = function () {
    Object.keys(skates).forEach(function (key) {
      skates[key].deafen();
    });

    return skate;
  };

  // Finds listeners matching the specified node.
  skate.listeners = function (element) {
    var listeners = [];
    var tag = elementComponentIdFromTag(element);
    var attrs = elementComponentIdsFromAttrs(element);
    var classes = elementComponentIdsFromClasses(element);

    addToListeners(skate.types.TAG, tag);
    attrs.forEach(addToListeners.bind(this, skate.types.ATTR));
    classes.forEach(addToListeners.bind(this, skate.types.CLASS));

    function addToListeners (type, id) {
      if (id && skates[id] && listenerControlsType(skates[id], type) && listeners.indexOf(skates[id]) === -1) {
        listeners.push(skates[id]);
      }
    }

    return listeners;
  };


  // Common Interface
  // ----------------

  function Skate (id, component) {
    if (!component) {
      component = {};
    }

    // Can specify a function that defaults to the insert callback.
    if (typeof component === 'function') {
      component = {
        insert: component
      };
    }

    this.component = component;
    this.id = id;

    inherit(this.component, skate.defaults);

    if (this.component.ready) {
      hideByListener(this);
    }

    if (this.component.listen) {
      this.listen();
    }
  }

  Skate.prototype = {
    // Initialises one or more elements.
    init: function (elements) {
      var that = this;

      eachElement(elements, function (element) {
        triggerLifecycle(that, element);
      });

      return this;
    },

    // Starts listening for new elements.
    listen: function () {
      if (skates[this.id]) {
        throw new Error('Listener for "' + this.id + '" already registered.');
      }

      skates[this.id] = this;
      this.init(this.id);

      return this;
    },

    // Stops listening for new elements.
    deafen: function () {
      delete skates[this.id];
      return this;
    }
  };


  // Lifecycle Triggers
  // ------------------

  // Triggers the entire lifecycle.
  function triggerLifecycle (instance, target) {
    triggerReady(instance, target, function (content) {
      if (content === undefined) {
        triggerInsert(instance, target);
      } else if (content !== target && target.parentNode) {
        // A placeholder for replacing the current element.
        var comment = document.createComment('placeholder');

        // Replace the target with the placeholder.
        target.parentNode.insertBefore(comment, target);
        target.parentNode.removeChild(target);

        // Handle HTML.
        if (typeof content === 'string') {
          var div = document.createElement('div');
          div.innerHTML = content;
          content = div.childNodes[0];
        }

        // Place each item before the comment in sequence.
        eachElement(content, function (element) {
          comment.parentNode.insertBefore(element, comment);
        });

        // Cleanup.
        comment.parentNode.removeChild(comment);
      }
    });
  }

  // Triggers the ready callback and continues execution to the insert callback.
  function triggerReady (instance, target, done) {
    var definedMultipleArgs = /^[^(]+\([^,)]+,/;
    var component = instance.component;
    var readyFn = component.ready;
    done = done || function (){};

    if (isReadyBlacklisted(target, instance.id)) {
      return done();
    }

    blacklistReady(target, instance.id);
    inherit(target, component.extend);

    if (component.attrs) {
      skateAdapter.addAttributeListener(target, component.attrs);
    }

    if (readyFn && definedMultipleArgs.test(readyFn)) {
      readyFn(target, done);
    } else if (readyFn) {
      done(readyFn(target));
    } else {
      done();
    }
  }

  // Triggers insert on the target.
  function triggerInsert (instance, target) {
    var component = instance.component;
    var insertFn = component.insert;

    if (isInsertBlacklisted(target, instance.id)) {
      return;
    }

    if (!document.documentElement.contains(target)) {
      return;
    }

    blacklistInsert(target, instance.id);
    addClass(target, classname);

    if (insertFn) {
      insertFn(target);
    }
  }

  // Triggers remove on the target.
  function triggerRemove (elements) {
    eachElement(elements, function (element) {
      skate.listeners(element).forEach(function (listener) {
        if (listener.component.remove) {
          listener.component.remove(element);
        }
      });
    });
  }


  // MutationObserver Adapter
  // ------------------------

  function mutationObserverAdapter () {
    var MutationObserver = window.MutationObserver || window.WebkitMutationObserver || window.MozMutationObserver;

    if (!MutationObserver) {
      return;
    }

    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.addedNodes && mutation.addedNodes.length) {
          skate.init(mutation.addedNodes);
          eachDescendant(mutation.addedNodes, skate.init);
        }

        if (mutation.removedNodes && mutation.removedNodes.length) {
          triggerRemove(mutation.removedNodes);
          eachDescendant(mutation.removedNodes, triggerRemove);
        }
      });
    });

    observer.observe(document, {
      childList: true,
      subtree: true
    });

    return {
      addAttributeListener: function (element, attributes) {
        function init (lifecycle, element, newValue) {
          (lifecycle.init || lifecycle.update || lifecycle)(element, newValue);
        }

        function update (lifecycle, element, newValue, oldValue) {
          (lifecycle.update || lifecycle)(element, newValue, oldValue);
        }

        function remove (lifecycle, element, oldValue) {
          lifecycle.remove(element, oldValue);
        }

        // We've gotta keep track of values because MutationObservers don't
        // seem to report this correctly.
        var lastValueCache = {};
        var obs = new MutationObserver(function (mutations) {
          mutations.forEach(function (mutation) {
            var name = mutation.attributeName;
            var attr = element.attributes[name];
            var lifecycle = attributes[name];
            var oldValue;
            var newValue;

            if (!lifecycle) {
              return;
            }

            // `mutation.oldValue` doesn't exist sometimes.
            oldValue = lastValueCache[name];

            // Only set a new value if the attribute exists.
            if (attr) {
              newValue = lastValueCache[name] = attr.nodeValue;
            }

            // `init()` or `update()` callback.
            if (attr && oldValue === undefined && (lifecycle.init || lifecycle.update || lifecycle)) {
              return init(lifecycle, element, newValue);
            }

            // `update()` callback.
            if (attr && oldValue !== undefined && (lifecycle.update || lifecycle)) {
              return update(lifecycle, element, newValue, oldValue);
            }

            // `remove()` callback.
            if (!attr && lifecycle.remove) {
              delete lastValueCache[name];
              return remove(lifecycle, element, oldValue);
            }
          });
        });

        obs.observe(element, {
          attributes: true
        });

        // Now trigger init on each attribute.
        for (var a = 0; a < element.attributes.length; a++) {
          var attribute = element.attributes[a];
          var lifecycle = attributes[attribute.nodeName];

          if (lifecycle) {
            init(lifecycle, element, attribute.nodeValue);
          }
        }
      }
    };
  }


  // Mutation Events Adapter
  // -----------------------

  function mutationEventAdapter () {
    var attributeListeners = [];

    // DOMNodeInserted doesn't behave correctly so we listen to subtree
    // modifications and init each descendant manually - similar to
    // mutation observers.
    document.addEventListener('DOMSubtreeModified', function (e) {
      skate.init(e.target);
      eachDescendant(e.target, skate.init);
    });

    document.addEventListener('DOMNodeRemoved', function (e) {
      triggerRemove(e.target, false);
    });

    var attrCallbacks = {
      // modification (update)
      1: function (lifecycle, element, e) {
        (lifecycle.update || lifecycle)(element, e.newValue, e.prevValue);
      },

      // addition (init / update)
      2: function (lifecycle, element, e) {
        (lifecycle.init || lifecycle.update || lifecycle)(element, e.newValue);
      },

      // removal (remove)
      3: function (lifecycle, element, e) {
        if (lifecycle.remove) {
          lifecycle.remove(element, e.prevValue);
        }
      }
    };

    return {
      addAttributeListener: function (element, attributes) {
        element.addEventListener('DOMAttrModified', function (e) {
          var lifecycle = attributes[e.attrName];

          if (lifecycle) {
            attrCallbacks[e.attrChange](lifecycle, element, e);
          }
        });

        // Now trigger init on each attribute.
        for (var a = 0; a < element.attributes.length; a++) {
          var attribute = element.attributes[a];
          var lifecycle = attributes[attribute.nodeName];

          if (lifecycle) {
            attrCallbacks[2](lifecycle, element, {
              newValue: attribute.nodeValue
            });
          }
        }
      }
    };
  }


  // Utilities
  // ---------

  // Returns whether or not the specified listener controls the given type.
  function listenerControlsType (listener, type) {
    return listener.component.type.indexOf(type) > -1;
  }

  // Merges the second argument into the first.
  function inherit (base, from) {
    for (var a in from) {
      if (typeof base[a] === 'undefined') {
        base[a] = from[a];
      }
    }
  }


  // Element State Helpers
  // ---------------------

  function blacklistReady (element, id) {
    if (!element[isReadyTriggeredProperty]) {
      element[isReadyTriggeredProperty] = [];
    }

    element[isReadyTriggeredProperty].push(id);
  }

  function blacklistInsert (element, id) {
    if (!element[isInsertTriggeredProperty]) {
      element[isInsertTriggeredProperty] = [];
    }

    element[isInsertTriggeredProperty].push(id);
  }

  function isReadyBlacklisted (element, id) {
    return element[isReadyTriggeredProperty] && element[isReadyTriggeredProperty].indexOf(id) > -1;
  }

  function isInsertBlacklisted (element, id) {
    return element[isInsertTriggeredProperty] && element[isInsertTriggeredProperty].indexOf(id) > -1;
  }


  // Element Identifier Helpers
  // --------------------------

  // Returns the component id from the tag name.
  function elementComponentIdFromTag (element) {
    return (element.tagName || '').toLowerCase();
  }

  // Returns the component ids from the component attribute or class names.
  function elementComponentIdsFromAttrs (element) {
    return [].map.call(element.attributes || [], function (attr) {
      return attr.nodeName;
    });
  }

  // Returns the component ids from the component class attribute.
  function elementComponentIdsFromClasses (element) {
    return (element.className || '').split(' ');
  }


  // Element Manipulation Helpers
  // ----------------------------

  function elementSelectorFromId (id) {
    return id + ', [' + id + '], .' + id;
  }

  // Returns the outer HTML of the specified element.
  function outerHtml (element) {
    return document.createElement('div').appendChild(element.cloneNode(true)).parentNode.innerHTML;
  }

  // Adds the specified class to the element.
  function addClass (element, classname) {
    if (element.classList) {
      element.classList.add(classname);
    } else {
      element.className += ' ' + classname;
    }
  }


  // Element Traversal Helpers
  // -------------------------

  // Calls the specified callback for each element.
  function eachElement (elements, callback) {
    if (elements.nodeType) {
      elements = [elements];
    } else if (typeof elements === 'string') {
      elements = document.querySelectorAll(elementSelectorFromId(elements));
    }

    for (var a = 0; a < elements.length; a++) {
      if (elements[a] && elements[a].nodeType === 1) {
        callback(elements[a], a);
      }
    }
  }

  // Triggers a callback for all descendants of each passed element.
  function eachDescendant (elements, callback) {
    eachElement(elements, function (element) {
      eachElement(element.getElementsByTagName('*'), function (descendant) {
        callback(descendant);
      });
    });
  }


  // Stylistic Helpers
  // -----------------

  // Adds a rule to hide the specified component by its id.
  function hideByListener (listener) {
    hiddenRules.sheet.insertRule(
      negateListenerSelector(listener) + '{display:none}',
      hiddenRules.sheet.cssRules.length
    );
  }

  // Returns a negated selector for the specified component.
  function negateListenerSelector (listener) {
    return listenerSelectors(listener).map(function (selector) {
      return selector + ':not(.' + classname + ')';
    });
  }

  // Generates a selector for all possible bindings of a component id.
  function listenerSelector (listener) {
    return selectors(listener).join(', ');
  }

  // Returns an array of selectors for the specified component.
  function listenerSelectors (listener) {
    var parts = [];

    if (listenerControlsType(listener, skate.types.TAG)) {
      parts.push(listener.id);
    }

    if (listenerControlsType(listener, skate.types.ATTR)) {
      parts.push('[' + listener.id + ']');
    }

    if (listenerControlsType(listener, skate.types.CLASS)) {
      parts.push('.' + listener.id);
    }

    return parts;
  }


  // Global Setup
  // ------------

  // Rules that hide elements as they're inserted so that elements are hidden
  // prior to calling the ready callback to prevent FOUC if the component
  // modifies the element in which it is bound.
  head.appendChild(hiddenRules);


  // Exporting
  // ---------

  if (typeof define === 'function' && define.amd) {
    define('skate', [], function () {
      return skate;
    });
  } else {
    window.skate = skate;
  }

})();
