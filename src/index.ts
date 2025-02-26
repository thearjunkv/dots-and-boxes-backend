import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { createServer } from 'http';
import {
	createRoom,
	joinRoom,
	leaveRoom,
	kickPlayerFromRoom,
	rejoinRoom,
	startGame,
	switchPlayer,
	resetRoom,
	leaveGame,
	reconnectGame,
	playerDisconnect
} from './services/game.service';
import { gameErrorMessages } from './constants/game';
import { GameError } from './errors/GameError';
import { RoomCreateDto, RoomJoinDto, RoomKickDto, GameMoveDto, RoomRejoinDto, GameReconnectDto } from './dtos/gameDto';
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
			socket.emit('room:create:ack', gameState);
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

			io.to(roomId).emit('room:update:state', gameState);
			socket.emit('room:join:ack', gameState);
		}, socket)
	);

	socket.on(
		'room:leave',
		safeSocketHandler(async () => {
			const { playerId, roomId } = socket.data;
			const gameState = await leaveRoom(playerId, roomId);

			socket.leave(roomId);
			socket.data = null;

			if (gameState) io.to(roomId).emit('room:update:state', gameState);
		}, socket)
	);

	socket.on(
		'room:kick',
		safeSocketHandler(async (payload: RoomKickDto) => {
			const { targetPlayerId } = payload;
			const { playerId, roomId } = socket.data;

			const gameState = await kickPlayerFromRoom(playerId, roomId, targetPlayerId);

			const targetSockets = await io.to(roomId).fetchSockets();
			targetSockets.forEach(targetSocket => {
				if (targetSocket.data.playerId === targetPlayerId && targetSocket.data.roomId === roomId) {
					targetSocket.leave(roomId);
					socket.data = null;
					targetSocket.emit('room:kicked');
				}
			});

			if (gameState) io.to(roomId).emit('room:update:state', gameState);
		}, socket)
	);

	socket.on(
		'room:rejoin',
		safeSocketHandler(async (payload: RoomRejoinDto) => {
			const { playerId, playerName, roomId } = payload;
			const gameState = await rejoinRoom(playerId, playerName, roomId);

			socket.join(roomId);

			socket.data.playerId = playerId;
			socket.data.playerName = playerName;
			socket.data.roomId = roomId;
			io.to(roomId).emit('room:update:state', gameState);
			socket.emit('room:rejoin:ack', gameState);
		}, socket)
	);

	socket.on(
		'room:game:start',
		safeSocketHandler(async () => {
			const { playerId, roomId } = socket.data;
			const gameState = await startGame(playerId, roomId);

			io.to(roomId).emit('room:game:started', gameState);
		}, socket)
	);

	socket.on(
		'room:game:move',
		safeSocketHandler(async (payload: GameMoveDto) => {
			const { selectedGridLine, shouldSwitchPlayer, isLastMove } = payload;
			const { roomId } = socket.data;

			let gameState: GameState | undefined;
			if (shouldSwitchPlayer) {
				gameState = await switchPlayer(roomId);
			}
			io.to(roomId).emit('room:game:updateBoard', { selectedGridLine, gameState });

			if (isLastMove) {
				resetRoom(roomId);

				const targetSockets = await io.to(roomId).fetchSockets();
				targetSockets.forEach(targetSocket => targetSocket.leave(roomId));
			}
		}, socket)
	);

	socket.on(
		'room:game:leave',
		safeSocketHandler(async () => {
			const { playerId, roomId } = socket.data;
			const gameState = await leaveGame(playerId, roomId);

			socket.leave(roomId);
			socket.data = null;

			if (gameState) io.to(roomId).emit('room:update:state', gameState);
		}, socket)
	);

	socket.on(
		'room:game:reconnect',
		safeSocketHandler(async (payload: GameReconnectDto) => {
			const { playerId, playerName, roomId } = payload;
			const gameState = await reconnectGame(playerId, roomId);

			socket.join(roomId);

			socket.data.playerId = playerId;
			socket.data.playerName = playerName;
			socket.data.roomId = roomId;

			io.to(roomId).emit('room:update:state', gameState);
			socket.emit('room:game:reconnect:ack', gameState);
		}, socket)
	);

	socket.on(
		'disconnect',
		safeSocketHandler(async () => {
			const { playerId, roomId } = socket.data;
			const data = await playerDisconnect(playerId, roomId);
			if (data) io.to(data.roomId).emit('room:update:state', data.gameState);
		}, socket)
	);
});

httpServer.listen(3000, () => {
	console.log('Socket.io server running on port 3000');
});
