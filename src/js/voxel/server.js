// external dependencies
var path = require('path')
var extend = require('extend')
// voxel depenencies
var voxelServer = require('voxel-server')
// internal dependencies
var modvox = require('./features/modvox/server.js')

module.exports = Server

function Server(opts) {
  // force instantiation via `new` keyword 
  if(!(this instanceof Server)) { return new Server(opts) }
  this.initialize(opts)
}

//
// Public
//

Server.prototype.connectClient = function(connection) {
  var self = this
  self.baseServer.connectClient(connection)
  self.bindEvents(connection)
  console.log(connection.id, 'joined')
}

Server.prototype.removeClient = function(connection) {
  var self = this
  self.baseServer.removeClient(connection)
  console.log(connection.id, 'left')
}

//
// Private
//

Server.prototype.initialize = function(opts) {
  var self = this

  var defaults = {
    generateChunks: false,
    chunkDistance: 2,
    materials: [
      ['grass', 'dirt', 'grass_dirt'],
      'dirt',
      'plank',
      'cobblestone',
      'brick',
      'bedrock',
      'glowstone',
      'netherrack',
      'obsidian',
      'diamond',
      'whitewool',
      'redwool',
      'bluewool',
    ],
    avatarInitialPosition: [2, 20, 2],
    forwardEvents: ['chat','spatialTrigger'],
  }
  var settings = self.settings = extend({}, defaults, opts)

  // get database
  self.voxelDb = settings.voxelDb
  // remove db from settings hash so we dont send it over the connection
  delete settings.voxelDb

  // enable event forwarding for features
  settings.forwardEvents.push('modvox')

  // create and initialize base game server
  var baseServer = self.baseServer = voxelServer(settings)
  self.game = baseServer.game

  // sane defaults
  self.spatialTriggers = []
  
  self.bindEvents()

  // add features
  modvox(self)
}

Server.prototype.bindEvents = function() {
  var self = this
  var settings = self.settings
  var baseServer = self.baseServer
  var game = self.game

  // setup spatial triggers
  self.setupSpatialTriggers()

  // setup world CRUD handlers
  baseServer.on('missingChunk', loadChunk)
  baseServer.on('set', function(pos, val) {
    var chunk = game.getChunkAtPosition(pos)
    storeChunk(chunk)
  })  
  // trigger world load
  game.voxels.requestMissingChunks(game.worldOrigin)

  // log chat
  baseServer.on('chat', function(message) {
    console.log('chat - ',message)
  })

  // handle errors
  baseServer.on('error',function(error){
    console.log('error - error caught in server:')
    console.log(error.stack)
  })

  // store chunk in db
  function storeChunk(chunk) {
    self.voxelDb.store(settings.worldId, chunk, function afterStore(err) {
      if (err) console.error('chunk store error', err.stack)
    })
  }
  
  // load chunk from db
  function loadChunk(position, complete) {
    var game = self.game
    var cs = game.chunkSize
      , dimensions = [cs, cs, cs]
    self.voxelDb.load(settings.worldId, position, dimensions, function(err, chunk) {
      if (err) return console.error('chunk load error', err.stack)
      var chunk = {
        position: position,
        voxels: new Uint8Array(chunk.voxels.buffer),
        dims: chunk.dimensions
      }
      game.showChunk(chunk)
    })
  }

}

Server.prototype.setupSpatialTriggers = function() {
  var self = this
  var baseServer = self.baseServer
  
  // get modvoxes from db
  self.voxelDb.db.get('spatialTriggers',function(err,val) {
    self.spatialTriggers = val ? JSON.parse(val) : []
  })

  // set modvox
  baseServer.on('spatialTrigger',function(spatialTrigger) {
    // add to list
    self.spatialTriggers.push(spatialTrigger)
    updateSpatialTriggerStore()
  })
  // send spatialTriggers on join
  baseServer.on('client.join',function(client) {
    self.spatialTriggers.map(function(spatialTrigger) {
      client.connection.emit('spatialTrigger',spatialTrigger)
    })
  })
  // store spatialTriggers
  function updateSpatialTriggerStore() {
    self.voxelDb.db.put('spatialTriggers',JSON.stringify(self.spatialTriggers))
  }

}
