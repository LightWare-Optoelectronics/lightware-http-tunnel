'use strict'

const net = require('net');
const chalk = require('chalk');

function log(str) {
	// console.log(str);
}

// Connects to external tunnel server process and forwards to local TCP server.
function startClient(tunnelPort, tunnelHostname, localPort, localHostname) {
	const tunnelSocket = new net.Socket();
	let clientSockets = {};

	let packetState = 0;
	let packetType = 0;
	let payloadSize = 0;
	let socketId = 0;

	tunnelSocket.connect(tunnelPort, tunnelHostname, () => {
		console.log(chalk.yellow('Tunnel client: Connected to tunnel server'));

		tunnelSocket.on('readable', () => {
			log('Readable: ' + tunnelSocket.readableLength);

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
					if (packetType == 0) {
						log('Packet: start');
						const data = tunnelSocket.read(4);

						if (data && data.length == 4) {
							socketId = data.readUint32LE(0);
							packetState = 0;
							log('Packet: Socket id: ' + socketId);

							const clientSocket = new net.Socket();
							const sockId = socketId;
							// clientSocket.connect(7010, '127.0.0.1', () => {
							clientSocket.connect(localPort, localHostname, () => {
								log(chalk.cyan('Tunnel client: create socket to local server ' + sockId));

								clientSocket.on('data', (data) => {
									log(sockId + ': ' + chalk.cyan('Client data: ' + data.length));

									let buffer = Buffer.alloc(12);
									buffer.writeUInt32LE(1, 0);
									buffer.writeUInt32LE(sockId, 4);
									buffer.writeUInt32LE(data.length, 8);
									tunnelSocket.write(buffer);
									tunnelSocket.write(data);
								});

								clientSocket.on('close', (hadError) => {
									log(sockId + ': ' + chalk.cyan('Client: close'));

									if (clientSockets[sockId]) {
										clientSockets[sockId].socket.destroy();
										delete clientSockets[sockId];
									}

									let buffer = Buffer.alloc(8);
									buffer.writeUInt32LE(2, 0);
									buffer.writeUInt32LE(sockId, 4);
									tunnelSocket.write(buffer);
								});

								clientSocket.on('end', (data) => {
									// Is this always called before close?
									log(sockId + ': ' + chalk.cyan('Client: end'));
									// TODO: send instruction to burn the socket.
								});

								clientSocket.on('error', (data) => {
									log(sockId + ': ' + chalk.cyan('Client: ') + chalk.red('error'));
								});
							});

							clientSockets[socketId] = {
								id: socketId,
								socket: clientSocket
							};
						} else {
							// NOTE: Not enough bytes.
							break;
						}
					} else if (packetType == 1) {
						log('Packet: data header');
						const data = tunnelSocket.read(8);

						if (data && data.length == 8) {
							socketId = data.readUint32LE(0);
							payloadSize = data.readUint32LE(4);
							packetState = 2;
							log('Packet: Socket id: ' + socketId + ' Size: ' + payloadSize);
						} else {
							// NOTE: Not enough bytes.
							break;
						}
					} else if (packetType == 2) {
						log('Packet: end');
						const data = tunnelSocket.read(4);

						if (data && data.length == 4) {
							socketId = data.readUint32LE(0);
							packetState = 0;
							log('Packet: Socket id: ' + socketId);

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
						log('Packet: data');
						
						const remainingBytes = Math.min(payloadSize, tunnelSocket.readableLength);
						if (remainingBytes == 0) {
							break;
						}
						const data = tunnelSocket.read(remainingBytes);
						
						if (data.length == remainingBytes) {
							payloadSize -= remainingBytes;
							log('Read ' + remainingBytes + ' bytes, have ' + payloadSize + ' bytes left to read.');

							log('Write data to ' + socketId);

							log(chalk.red(clientSockets[socketId].socket.pending));

							if (clientSockets[socketId]) {
								clientSockets[socketId].socket.write(data);
							}

							if (payloadSize == 0) {
								log('Full packet got');
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
			console.log(chalk.yellow('Tunnel client: close'));
		});

		tunnelSocket.on('error', (hadError) => {
			console.log(chalk.yellow('Tunnel client: ') + chalk.red('error'));
		});

		tunnelSocket.on('end', (hadError) => {
			console.log(chalk.yellow('Tunnel client: end'));
		});
	});

	tunnelSocket.on('error', (err) => {
		console.log(chalk.red('Outer error'));
	});
}

startClient(6969, '127.0.0.1', 7010, '25.36.58.201');

