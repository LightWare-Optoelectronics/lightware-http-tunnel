'use strict'

const http = require('http');
const express = require('express');

const app = express();

app.get('/', (req, res) => {
	res.send('Hello world');
});

app.listen(7272, ()=> {
	console.log('HTTP server started');
});
