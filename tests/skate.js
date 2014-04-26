(function() {
  'use strict';


  // Polyfill DOMAttrModified for PhantomJS
  // --------------------------------------

  HTMLElement.prototype.__setAttribute = HTMLElement.prototype.setAttribute
  HTMLElement.prototype.setAttribute = function(attrName, newVal)
  {
    var prevVal = this.getAttribute(attrName);
    this.__setAttribute(attrName, newVal);
    newVal = this.getAttribute(attrName);
    if (newVal != prevVal)
    {
      var evt = document.createEvent("MutationEvent");
      evt.initMutationEvent(
        "DOMAttrModified",
        true,
        false,
        this,
        prevVal || "",
        newVal || "",
        attrName,
        (prevVal == null) ? evt.ADDITION : evt.MODIFICATION
      );
      this.dispatchEvent(evt);
    }
  };

  HTMLElement.prototype.__removeAttribute = HTMLElement.prototype.removeAttribute;
  HTMLElement.prototype.removeAttribute = function(attrName)
  {
    var prevVal = this.getAttribute(attrName);
    this.__removeAttribute(attrName);
    var evt = document.createEvent("MutationEvent");
    evt.initMutationEvent(
      "DOMAttrModified",
      true,
      false,
      this,
      prevVal,
      "",
      attrName,
      evt.REMOVAL
    );
    this.dispatchEvent(evt);
  };


  // Setup
  // -----

  function addDivToBody(id) {
    var div = document.createElement('div');
    div.id = id || 'test';
    document.querySelector('body').appendChild(div);
    return div;
  }

  function removeDivFromBody(id) {
    var div = document.querySelector('#' +  (id || 'test'));

    if (div) {
      document.querySelector('body').removeChild(div);
    }
  }

  afterEach(function() {
    skate.destroy();
    document.querySelector('body').innerHTML = '';
  });


  // Specs
  // -----

  describe('Lifecycle Callbacks', function() {
    it('Should trigger ready before the element is shown.', function(done) {
      skate('div', {
        ready: function(element) {
          element.classList.contains('_skate').should.equal(false);
          done();
        }
      });

      addDivToBody();
    });

    it('Should trigger insert after the element is shown.', function(done) {
      skate('div', {
        insert: function(element) {
          element.classList.contains('_skate').should.equal(true);
          done();
        }
      });

      addDivToBody();
    });

    it('Should trigger removed when the element is removed.', function(done) {
      skate('div', {
        remove: function() {
          assert(true);
          done();
        }
      });

      skate.init(addDivToBody());
      removeDivFromBody();
    });
  });


  describe('DOM node interaction.', function() {
    it('Modules should pick up nodes already in the DOM.', function(done) {
      addDivToBody().textContent = 'test';

      skate('div', {
        insert: function(element) {
          element.textContent.should.equal('test');
          done();
        }
      });
    });

    it('Modules should pick up nodes inserted into the DOM after they are defined.', function(done) {
      skate('div', {
        insert: function(element) {
          element.textContent.should.equal('test');
          done();
        }
      });

      var div = document.createElement('div');
      div.textContent = 'test';
      document.body.appendChild(div);
    });
  });

  describe('Async ready callback.', function() {
    it('Ready event should be async and provide a done callback.', function(done) {
      var ok = false;

      skate('div', {
        ready: function(element, next) {
          setTimeout(function() {
            ok = true;
            next();
          }, 100);
        },

        insert: function() {
          assert(ok);
          done();
        }
      });

      addDivToBody();
    });
  });

  describe('Display none / block / etc behavior', function() {
    it('Should not be initialised twice', function() {
      var initialised = 0;

      skate('div', {
        insert: function() {
          ++initialised;
        }
      });

      var div = addDivToBody();
      skate.init(div);
      div.style.display = 'none';
      div.style.display = 'block';
      initialised.should.equal(1);
    });
  });

  describe('Synchronous initialisation', function() {
    it('Should take traversable items', function() {
      var initialised = false;

      skate('div', {
        insert: function() {
          ++initialised;
        }
      });

      addDivToBody();
      addDivToBody();

      skate.init(document.querySelectorAll('div'));
      initialised.should.equal(2);
    });

    it('Should take an element', function() {
      var initialised = 0;

      skate('div', {
        insert: function() {
          ++initialised;
        }
      });

      skate.init(addDivToBody());
      initialised.should.equal(1);
    });

    it('Should take a selector', function() {
      var initialised = 0;

      skate('div', {
        insert: function() {
          ++initialised;
        }
      });

      addDivToBody();
      addDivToBody();

      skate.init('div');
      initialised.should.equal(2);
    });
  });

  describe('Destroying all listeners', function() {
    it('Should be able to destroy all listeners', function() {
      skate.listeners.length.should.equal(0);

      var Div = skate('div', {
        insert: function(){}
      });

      expect(skate.listeners[Div.listener.id]).to.equal(Div.listener);
      skate.destroy();
      expect(skate.listeners[Div.listener.id]).to.be.undefined;

      var div = new Div();
      skate.init(div);
      div.textContent.should.equal('');
    });
  });

  describe('Attribute listeners', function() {
    it('Should listen to changes in specified attributes', function(done) {
      var init = false;
      var update = false;
      var remove = false;

      skate('div', {
        attrs: {
          open: {
            init: function(element, value) {
              value.should.equal('init');
            },
            update: function(element, value, oldValue) {
              oldValue.should.equal('init');
              value.should.equal('update');
            },
            remove: function(element, value) {
              value.should.equal('update');
              done();
            }
          }
        }
      });

      var div = addDivToBody();
      skate.init(div);

      div.setAttribute('open', 'init');

      setTimeout(function() {
        div.setAttribute('open', 'update');
      }, 100);

      setTimeout(function() {
        div.removeAttribute('open');
      }, 200);
    });

    it('Should use the update callback as the init callback if no init callback is specified.', function(done) {
      var init = false;
      var update = false;

      skate('div', {
        attrs: {
          open: {
            update: function(element, value, oldValue) {
              value.should.equal('true');
              expect(oldValue).to.be.undefined;
              done();
            }
          }
        }
      });

      var div = addDivToBody();
      skate.init(div);
      div.setAttribute('open', 'true');
    });
  });

  describe('Extending', function() {
    it('Instead of using a custom tag, an attribute can be used to signify behaviour.', function() {
      var init = false;

      skate('datepicker', function() {
        init = true;
      });

      var div = document.createElement('div');
      div.setAttribute('is', 'datepicker');
      document.body.appendChild(div);
      skate.init(div);

      init.should.equal(true);
    });
  });

  describe('Instantiation', function() {
    it('Should return a constructor', function() {
      skate('div').should.be.a.function;
    });

    it('Should return a new element when constructed.', function() {
      var Div = skate('div');
      var div = new Div();
      div.nodeName.should.equal('DIV');
    });

    it('Should return a new element when called without "new".', function() {
      var div = skate('div');
      div().nodeName.should.equal('DIV');
    });

    it('Should synchronously initialise the new element.', function() {
      var called = false;
      var div = skate('div', {
        extend: {
          someMethod: function() {
            called = true;
          }
        }
      });

      div().someMethod();
      called.should.equal(true);
    });
  });
})();
