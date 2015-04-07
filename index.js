var async = require('async'),
	config = require('./config'),
	cp = require('child_process'),
	express = require('express');

var app = express();
app.listen(config.port);

// Array of response objects
var listeners = [];

app.get('/', function(req, resp) {
	resp.set({
		'Access-Control-Allow-Origin': '*',
		"content-type": 'audio/mpeg',
		'Expires': 'Thu, 01 Jan 1970 00:00:00 GMT',
		'Cache-Control': 'no-cache, no-store'
	});
	listeners.push(resp);
	// Remove listener on client disconnect
	req.on('close', function() {
		var index = listeners.indexOf(resp);
		if (index > -1)
			listeners.splice(index, 1);
	});
});

// Get binary paths
var bins = {};

function which(name, cb) {
	cp.exec('which ' + name, function(err, stdout) {
		if (err)
			cb(err);
		bins[name] = stdout.trim();
		cb(null);
	});
}

async.parallel([
	which.bind(null, 'ffmpeg'),
	which.bind(null, 'livestreamer')
], startServer);

function startServer(err) {
	if (err)
		throw err;
	fallback();
	console.log('Server started on port ' + config.port);
}

// Loop stream that plays, when the source channel is down
function fallback() {
	var ffmpeg = cp.spawn(bins.ffmpeg, [
		'-re', '-i', './fallback.mp3',
		'-c:a', 'copy',
		'-f', 'mp3',
		'-'
	]);
	ffmpeg.stdout.on('data', function(data) {
		listeners.forEach(function(resp) {
			resp.write(data);
		});
		console.log(listeners.length);
	});
	// Restart the loop stream
	ffmpeg.stdout.once('close', function() {
		fallback();
	});
}