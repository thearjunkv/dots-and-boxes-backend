import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { createServer } from 'http';
import {
	createRoom,
	joinRoom,
	kickPlayerFromRoom,
	leaveRoom,
	playerDisconnect,
	rejoinRoom,
	resetRoom,
	startGame,
	switchPlayer
} from './services/game.service';
import { gameErrorMessages } from './constants/game';
import { GameError } from './errors/GameError';
import { RoomCreateDto, RoomJoinDto, RoomKickDto, GameMoveDto } from './dtos/gameDto';
import { GameState } from './types';

const httpServer = createServer();
const io = new Server(httpServer, {
	cors: { origin: '*' }
});

const safeSocketHandler = (
	handler: Function,
	socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>
) => {
	return async (...args: any[]) => {
		try {
			await handler(...args);
		} catch (e) {
			console.error('Error: ', e);
			if (e instanceof GameError) socket.emit('error', { message: e.message });
			else socket.emit('error', { message: gameErrorMessages.INTERNAL_SERVER_ERROR });
		}
	};
};

io.on('connection', socket => {
	socket.on(
		'room:create',
		safeSocketHandler(async (payload: RoomCreateDto) => {
			const { playerId, playerName, gridSize } = payload;
			const { roomId, gameState } = await createRoom(playerId, playerName, gridSize);

			socket.data.playerId = playerId;
			socket.data.playerName = playerName;
			socket.data.roomId = roomId;
			socket.join(roomId);
			socket.emit('room:create:ack', { gameState });
		}, socket)
	);

	socket.on(
		'room:join',
		safeSocketHandler(async (payload: RoomJoinDto) => {
			const { playerId, playerName, roomId } = payload;
			const gameState = await joinRoom(playerId, playerName, roomId);

			socket.data.playerId = playerId;
			socket.data.playerName = playerName;
			socket.data.roomId = roomId;
			socket.join(roomId);
			io.to(roomId).emit('room:refresh:preGame', { gameState });
			socket.emit('room:join:ack', { gameState });
		}, socket)
	);

	socket.on(
		'room:leave',
		safeSocketHandler(async () => {
			const { playerId, roomId } = socket.data;
			const gameState = await leaveRoom(playerId, roomId);

			socket.leave(roomId);
			socket.emit('room:leave:ack');

			if (gameState) io.to(roomId).emit('room:refresh:preGame', { gameState });
		}, socket)
	);

	socket.on(
		'room:kick',
		safeSocketHandler(async (payload: RoomKickDto) => {
			const { targetPlayerId } = payload;
			const { playerId, roomId } = socket.data;

			const gameState = await kickPlayerFromRoom(playerId, roomId, targetPlayerId);

			const targetSockets = await io.in(roomId).fetchSockets();
			targetSockets.forEach(targetSocket => {
				if (targetSocket.data.playerId === targetPlayerId && targetSocket.data.roomId === roomId) {
					targetSocket.leave(roomId);
					targetSocket.emit('room:kicked');
				}
			});

			socket.emit('room:kick:ack');

			if (gameState) io.to(roomId).emit('room:refresh:preGame', { gameState });
		}, socket)
	);

	socket.on(
		'game:start',
		safeSocketHandler(async () => {
			const { playerId, roomId } = socket.data;
			const gameState = await startGame(playerId, roomId);

			io.to(roomId).emit('game:started', { gameState });
			socket.emit('game:start:ack');
		}, socket)
	);

	socket.on(
		'game:move',
		safeSocketHandler(async (payload: GameMoveDto) => {
			const { selectedGridLine, shouldSwitchPlayer, isLastMove } = payload;
			const { roomId } = socket.data;

			let gameState: GameState | undefined;
			if (shouldSwitchPlayer) {
				gameState = await switchPlayer(roomId);
			}
			io.to(roomId).emit('game:newMove', { selectedGridLine, gameState });
			socket.emit('game:move:ack');

			if (isLastMove) resetRoom(roomId);
		}, socket)
	);

	socket.on(
		'room:rejoin',
		safeSocketHandler(async () => {
			const { playerId, playerName, roomId } = socket.data;
			const gameState = await rejoinRoom(playerId, playerName, roomId);

			io.to(roomId).emit('room:refresh:preGame', { gameState });
			socket.emit('room:rejoin:ack', { gameState });
		}, socket)
	);

	socket.on(
		'disconnect',
		safeSocketHandler(async () => {
			const { playerId, roomId } = socket.data;
			const data = await playerDisconnect(playerId, roomId);
			if (data) io.to(data.roomId).emit('room:playerDisconnect', { gameState: data.gameState });
		}, socket)
	);
});

httpServer.listen(3000, () => {
	console.log('Socket.io server running on port 3000');
});
