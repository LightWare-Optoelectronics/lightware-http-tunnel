'use strict'

const net = require('net');
const chalk = require('chalk');

// Waits for external client connections and forwards to connected client process.
function startServer() {
	console.log('Starting proxy client');

	const server = net.createServer();

	server.listen(8000, '127.0.0.1', () => {
		console.log('TCP server running...');
	});

	let globalSocketId = 0;

	server.on('connection', (sock) => {
		const socketId = globalSocketId;
		++globalSocketId;

		console.log(chalk.blue('New TCP connection ' + socketId));

		const proxySock = new net.Socket();
		proxySock.connect(7010, 'localhost', () => {
			proxySock.on('data', (data) => {
				console.log(socketId + ': ' + chalk.yellow('Proxy Data: ' + data.length));
				sock.write(data);
			});

			proxySock.on('close', (hadError) => {
				console.log(socketId + ': ' + chalk.yellow('Proxy: close'));
			});

			proxySock.on('error', (hadError) => {
				console.log(socketId + ': ' + chalk.yellow('Proxy: ') + chalk.red('error'));
			});

			proxySock.on('end', (hadError) => {
				console.log(socketId + ': ' + chalk.yellow('Proxy: end'));
				sock.destroy();
			});

			sock.on('data', (data) => {
				console.log(socketId + ': ' + chalk.blue('Socket Data: ' + data.length));
				proxySock.write(data);
			});

			sock.on('close', (hadError) => {
				console.log(socketId + ': ' + chalk.blue('Socket: close'));
			});

			sock.on('end', (data) => {
				// Is this always called before close?
				console.log(socketId + ': ' + chalk.blue('Socket: end'));
				proxySock.destroy();
			});

			sock.on('error', (data) => {
				console.log(socketId + ': ' + chalk.blue('Proxy: ') + chalk.red('error'));
			});
		});
	});
}

// Connects to external server process and forwards to local TCP server.
function startClient() {
	
}

startServer();

