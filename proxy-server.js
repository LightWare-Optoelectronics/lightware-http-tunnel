'use strict'

const net = require('net');
const chalk = require('chalk');

//------------------------------------------------------------------------------------------------------------------------------------
// Utilities
//------------------------------------------------------------------------------------------------------------------------------------
function getTimeString(date) {
	return String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0') + ':' + String(date.getSeconds()).padStart(2, '0') + ':' + String(date.getMilliseconds()).padStart(3, '0');
}

function getDateString(date) {
	const timeStr = getTimeString(date);

	const dateStr = String(date.getFullYear()).padStart(2, '0') + '-' +
		String(date.getMonth() + 1).padStart(2, '0') + '-' +
		String(date.getDate()).padStart(2, '0') + 'T' + timeStr;

	return dateStr;
}

function log(str) {
	// console.log(str);
}

function log2(level, str) {
	console.log(getDateString(new Date) + ' ' + str);
}

//------------------------------------------------------------------------------------------------------------------------------------
// Application.
//------------------------------------------------------------------------------------------------------------------------------------
// Waits for external tunnel client connections and forwards to connected client process.
function startServer(tunnelPort, listenPort) {
	console.log('Starting proxy client');
	let globalSocketId = 0;
	let clientSockets = {};

	//------------------------------------------------------------------------------------------------------------------------------------
	// Tunnel server.
	//------------------------------------------------------------------------------------------------------------------------------------
	let tunnelSocket = null;

	let packetState = 0;
	let packetType = 0;
	let payloadSize = 0;
	let socketId = 0;

	const tunnelServer = net.createServer();
	
	tunnelServer.listen(tunnelPort, () => {
		console.log(chalk.green('Tunnel server running...'));
	});

	tunnelServer.on('connection', (socket) => {
		socket.setNoDelay(true);
		log(chalk.green('Tunnel server: new connection'));
		tunnelSocket = socket;

		tunnelSocket.on('readable', () => {
			log(chalk.green('Readable: ' + tunnelSocket.readableLength));

			while (true) {
				if (packetState == 0) {
					const data = tunnelSocket.read(4);

					if (data && data.length == 4) {
						packetType = data.readUint32LE(0);
						packetState = 1;
						log('Packet - Type: ' + packetType);
					} else {
						// NOTE: Not enough bytes.
						break;
					}
				} else if (packetState == 1) {
					if (packetType == 1) {
						log(chalk.green('Packet: data header'));
						const data = tunnelSocket.read(8);

						if (data && data.length == 8) {
							socketId = data.readUint32LE(0);
							payloadSize = data.readUint32LE(4);
							packetState = 2;
							log(chalk.green('Packet: Socket id: ' + socketId + ' Size: ' + payloadSize));
						} else {
							// NOTE: Not enough bytes.
							break;
						}
					} else if (packetType == 2) {
						log(chalk.green('Packet: end'));
						const data = tunnelSocket.read(4);

						if (data && data.length == 4) {
							socketId = data.readUint32LE(0);
							packetState = 0;
							log(chalk.green('Packet: Socket id: ' + socketId));

							if (clientSockets[socketId]) {
								clientSockets[socketId].socket.destroy();
								delete clientSockets[socketId];
							}

						} else {
							// NOTE: Not enough bytes.
							break;
						}
					}
				} else if (packetState == 2) {
					if (packetType == 1) {
						log(chalk.green('Packet: data'));
						
						const remainingBytes = Math.min(payloadSize, tunnelSocket.readableLength);
						if (remainingBytes == 0) {
							break;
						}
						const data = tunnelSocket.read(remainingBytes);
						
						if (data.length == remainingBytes) {
							payloadSize -= remainingBytes;
							log2(0, chalk.green('Read ' + remainingBytes + ' bytes, have ' + payloadSize + ' bytes left to read.'));

							if (clientSockets[socketId]) {
								clientSockets[socketId].socket.write(data);
							}

							if (payloadSize == 0) {
								log(chalk.green('Full packet got'));
								packetState = 0;
							}
						} else {
							// NOTE: Stream has collapsed.
							break;
						}
					}
				}
			}
		});

		tunnelSocket.on('close', (hadError) => {
			console.log(chalk.green('Tunnel server: close'));
		});

		tunnelSocket.on('end', (data) => {
			console.log(chalk.green('Tunnel server: end'));
		});

		tunnelSocket.on('error', (data) => {
			console.log(chalk.green('Tunnel server: ') + chalk.red('error'));
		});
	});

	
	//------------------------------------------------------------------------------------------------------------------------------------
	// Client TCP server.
	//------------------------------------------------------------------------------------------------------------------------------------
	const server = net.createServer();

	server.listen(listenPort, () => {
		console.log(chalk.blue('Client TCP server running...'));
	});

	server.on('connection', (socket) => {
		socket.setNoDelay(true);

		const socketId = globalSocketId;
		++globalSocketId;

		log2(0, socketId + ': ' + chalk.blue('New TCP client'));

		clientSockets[socketId] = {
			id: socketId,
			socket: socket
		};

		{
			let buffer = Buffer.alloc(8);
			buffer.writeUInt32LE(0, 0);
			buffer.writeUInt32LE(socketId, 4);
			tunnelSocket.write(buffer);
		}

		// console.log(Object.entries(clientSockets).length);

		socket.on('data', (data) => {
			log2(0, socketId + ': ' + chalk.blue('Client data: ' + data.length));

			let buffer = Buffer.alloc(12);
			buffer.writeUInt32LE(1, 0);
			buffer.writeUInt32LE(socketId, 4);
			buffer.writeUInt32LE(data.length, 8);
			tunnelSocket.write(buffer);
			tunnelSocket.write(data);
		});

		socket.on('close', (hadError) => {
			log2(0, socketId + ': ' + chalk.blue('Client: close'));

			if (clientSockets[socketId]) {
				clientSockets[socketId].socket.destroy();
				delete clientSockets[socketId];
			}

			let buffer = Buffer.alloc(8);
			buffer.writeUInt32LE(2, 0);
			buffer.writeUInt32LE(socketId, 4);
			tunnelSocket.write(buffer);
		});

		socket.on('end', (data) => {
			// Is this always called before close?
			log(socketId + ': ' + chalk.blue('Client: end'));
			// TODO: send instruction to burn the socket.
		});

		socket.on('error', (data) => {
			log(socketId + ': ' + chalk.blue('Client: ') + chalk.red('error'));
		});
	});
}

startServer(6969, 12300);

