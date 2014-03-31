var rethinkdbdash = require('rethinkdbdash');
var Model = require(__dirname+'/model.js');

/*
 * Main method
 * Create the default database
 *
 * Fields in `options` can be:
 *  - `min`: <number> - minimum number of connections in the pool, default 50
 *  - `max`: <number> -  maximum number of connections in the pool, default 1000
 *  - `bufferSize`: <number> - minimum number of connections available in the pool, default 50
 *  - `timeoutError`: <number> - wait time before reconnecting in case of an error (in ms), default 1000
 *  - `timeoutGb`: <number> - how long the pool keep a connection that hasn't been used (in ms), default 60*60*1000
 *  - `enforce`: {missing: <boolean>, extra: <boolean>, type: <boolean>}
 *  - `timeFormat`: "raw" or "native"
 *
 */
function Thinky(config) {
    var self = this;

    config = config || {};
    config.db = config.db || 'test'; // We need the default db to create it.

    
    this._options = {}
    this._options.enforce_missing = (config.enforce_missing != null) ? config.enforce_missing : false;
    this._options.enforce_extra = (config.enforce_extra != null) ? config.enforce_extra : false;
    this._options.enforce_type = (config.enforce_type != null) ? config.enforce_type : 'loose'; // loose, strict, none
    this._options.timeFormat = (config.timeFormat != null) ? config.timeFormat : 'native';
    this._options.validate = (config.validate != null) ? config.validate : 'onsave'; // 'onsave' or 'oncreate'

    this.r = rethinkdbdash(config);
    this.models = {};

    // Can we start using the database?
    this._dbReady = false;
    this._onDbReady = []; // functions to execute once the database is ready

    // Create the default database
    this.r.dbCreate(config.db).run().then(function(result) {
        self._dbReady = true; 
    }).error(function(error) {
        if (error.message.match(/^Database .* already exists.*/)) {
            self._dbReady = true;
        }
        else {
            throw error;
        }
    }); 
}

Thinky.prototype.getOptions = function() {
    return this._options;
}


Thinky.prototype.createModel = function(name, schema, options) {
    var self = this;

    options = options || {};

    if (self.models[name] !== undefined) {
        throw new Error("Cannot redefine a Model");
    }

    model = Model.new(name, schema, options, self);
    self.models[name] = model;

    if (options.init !== false) {
        // Create the table, or push the table name in the queue.
        if (self._dbReady) {
            self.r.tableCreate(name).run().then(function(result) {
                model._setReady();
            }).error(function(error) {
                if (error.message.match(/^Database .* already exists.*/)) {
                    model._setReady();
                }
                else {
                    model._error = error;
                }
            })
        }
        else {
            self._onDbReady.push(function() {
                self.r.tableCreate(name).run().then(function(result) {
                    model._setReady();
                }).error(function(error) {
                    if (error.message.match(/^Database .* already exists.*/)) {
                        model._setReady();
                    }
                    else {
                        model._error = error;
                    }
                })
            });
        }
    }

    return model;
}


module.exports = function(config) {
    return new Thinky(config);
}