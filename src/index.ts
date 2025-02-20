import { Server } from 'socket.io';
import { createServer } from 'http';

const httpServer = createServer();
const io = new Server(httpServer, {
	cors: { origin: '*' }
});

io.on('connection', socket => {
	console.log('A user connected:', socket.id);

	socket.on('room:create', data => {
		console.log('Room created with data:', data);
		socket.emit('message', { text: 'Hi' });
	});

	socket.on('disconnect', () => {
		console.log('User disconnected:', socket.id);
	});
});

httpServer.listen(3000, () => {
	console.log('Socket.io server running on port 3000');
});
