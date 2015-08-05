var fs = require('fs')
var parseTorrent = require('parse-torrent')
var test = require('tape')
var WebTorrent = require('../')
var DHT = require('bittorrent-dht/client')
var parallel = require('run-parallel')
var bufferEqual = require('buffer-equal')

var leaves = fs.readFileSync(__dirname + '/torrents/leaves.torrent')
var leavesTorrent = parseTorrent(leaves)
var leavesBook = fs.readFileSync(__dirname + '/content/Leaves of Grass by Walt Whitman.epub')

var leavesMagnetURI = 'magnet:?xt=urn:btih:d2474e86c95b19b8bcfdb92bc12c9d44667cfa36&dn=Leaves+of+Grass+by+Walt+Whitman.epub&tr=http%3A%2F%2Ftracker.thepiratebay.org%2Fannounce&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A80&tr=udp%3A%2F%2Ftracker.ccc.de%3A80&tr=udp%3A%2F%2Ftracker.publicbt.com%3A80&tr=udp%3A%2F%2Ffr33domtracker.h33t.com%3A3310%2Fannounce&tr=http%3A%2F%2Ftracker.bittorrent.am%2Fannounce'

test('client.add (magnet uri, torrent file, info hash, and parsed torrent)', function (t) {
  // magnet uri (utf8 string)
  var client1 = new WebTorrent({ dht: false, tracker: false })
  var torrent1 = client1.add('magnet:?xt=urn:btih:' + leavesTorrent.infoHash)
  t.equal(torrent1.infoHash, leavesTorrent.infoHash)
  t.equal(torrent1.magnetURI, 'magnet:?xt=urn:btih:' + leavesTorrent.infoHash)
  client1.destroy()

  // torrent file (buffer)
  var client2 = new WebTorrent({ dht: false, tracker: false })
  var torrent2 = client2.add(leaves)
  t.equal(torrent2.infoHash, leavesTorrent.infoHash)
  t.equal(torrent2.magnetURI, leavesMagnetURI)
  client2.destroy()

  // info hash (hex string)
  var client3 = new WebTorrent({ dht: false, tracker: false })
  var torrent3 = client3.add(leavesTorrent.infoHash)
  t.equal(torrent3.infoHash, leavesTorrent.infoHash)
  t.equal(torrent3.magnetURI, 'magnet:?xt=urn:btih:' + leavesTorrent.infoHash)
  client3.destroy()

  // info hash (buffer)
  var client4 = new WebTorrent({ dht: false, tracker: false })
  var torrent4 = client4.add(new Buffer(leavesTorrent.infoHash, 'hex'))
  t.equal(torrent4.infoHash, leavesTorrent.infoHash)
  t.equal(torrent4.magnetURI, 'magnet:?xt=urn:btih:' + leavesTorrent.infoHash)
  client4.destroy()

  // parsed torrent (from parse-torrent)
  var client5 = new WebTorrent({ dht: false, tracker: false })
  var torrent5 = client5.add(leavesTorrent)
  t.equal(torrent5.infoHash, leavesTorrent.infoHash)
  t.equal(torrent5.magnetURI, leavesMagnetURI)
  client5.destroy()

  t.end()
})

test('client.seed (Buffer, Blob)', function (t) {
  t.plan(typeof Blob !== 'undefined' ? 4 : 2)

  var opts = {
    name: 'Leaves of Grass by Walt Whitman.epub',
    announce: [
      'http://tracker.thepiratebay.org/announce',
      'udp://tracker.openbittorrent.com:80',
      'udp://tracker.ccc.de:80',
      'udp://tracker.publicbt.com:80',
      'udp://fr33domtracker.h33t.com:3310/announce',
      'http://tracker.bittorrent.am/announce'
    ]
  }

  // torrent file (Buffer)
  var client1 = new WebTorrent({ dht: false, tracker: false })
  client1.seed(leavesBook, opts, function (torrent1) {
    t.equal(torrent1.infoHash, leavesTorrent.infoHash)
    t.equal(torrent1.magnetURI, leavesMagnetURI)
    client1.destroy()
  })

  // Blob
  if (typeof Blob !== 'undefined') {
    var client2 = new WebTorrent({ dht: false, tracker: false })
    client2.seed(new Blob([ leavesBook ]), opts, function (torrent2) {
      t.equal(torrent2.infoHash, leavesTorrent.infoHash)
      t.equal(torrent2.magnetURI, leavesMagnetURI)
      client2.destroy()
    })
  } else {
    console.log('Skipping Blob test because missing `Blob` constructor')
  }
})

test('after client.destroy(), throw on client.add() or client.seed()', function (t) {
  t.plan(3)

  var client = new WebTorrent({ dht: false, tracker: false })
  client.destroy(function () {
    t.pass('client destroyed')
  })
  t.throws(function () {
    client.add('magnet:?xt=urn:btih:' + leavesTorrent.infoHash)
  })
  t.throws(function () {
    client.seed(new Buffer('sup'))
  })
})

test('after client.destroy(), no "torrent" or "ready" events emitted', function (t) {
  t.plan(1)

  var client = new WebTorrent({ dht: false, tracker: false })
  client.add(leaves, function () {
    t.fail('unexpected "torrent" event (from add)')
  })
  client.seed(leavesBook, function () {
    t.fail('unexpected "torrent" event (from seed)')
  })
  client.on('ready', function () {
    t.fail('unexpected "ready" event')
  })
  client.destroy(function () {
    t.pass('client destroyed')
  })
})

test('download via DHT', function (t) {
  t.plan(2)

  var data = new Buffer('blah blah')
  var dhts = []

  // need 3 because nodes don't advertise themselves as peers
  for (var i = 0; i < 3; i++) {
    dhts.push(new DHT({ bootstrap: false }))
  }

  parallel(dhts.map(function (dht) {
    return function (cb) {
      dht.listen(function (port) {
        cb(null, port)
      })
    }
  }), function () {
    for (var i = 0; i < dhts.length; i++) {
      for (var j = 0; j < dhts.length; j++) {
        if (i !== j) dhts[i].addNode('127.0.0.1:' + getDHTPort(dhts[j]), dhts[j].nodeId)
      }
    }

    var client1 = new WebTorrent({ dht: dhts[0], tracker: false })
    var client2 = new WebTorrent({ dht: dhts[1], tracker: false })

    client1.seed(data, { name: 'blah' }, function (torrent1) {
      client2.download(torrent1.infoHash, function (torrent2) {
        t.equal(torrent2.infoHash, torrent1.infoHash)
        torrent2.on('done', function () {
          t.ok(bufferEqual(getFileData(torrent2), data))
          dhts.forEach(function (d) {
            d.destroy()
          })

          client1.destroy()
          client2.destroy()
        })
      })
    })
  })
})

test('don\'t kill passed in DHT on destroy', function (t) {
  t.plan(1)

  var dht = new DHT({ bootstrap: false })
  var destroy = dht.destroy
  var okToDie
  dht.destroy = function () {
    t.equal(okToDie, true)
    dht.destroy = destroy.bind(dht)
    dht.destroy()
  }

  var client = new WebTorrent({ dht: dht, tracker: false })
  client.destroy(function () {
    okToDie = true
    dht.destroy()
  })
})

function getFileData (torrent) {
  var pieces = torrent.files[0].pieces

  return Buffer.concat(pieces.map(
    function (piece) {
      return piece.buffer
    }
  ))
}

function getDHTPort (dht) {
  return dht.address().port
}
