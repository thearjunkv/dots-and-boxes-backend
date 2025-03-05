import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { createServer } from 'http';
import {
	createRoom,
	joinRoom,
	leaveRoom,
	kickPlayerFromRoom,
	rejoinRoom,
	startGame,
	leaveGame,
	reconnectGame,
	playerDisconnect,
	saveGameProgress,
	clearGameDataFromStore
} from './services/game.service';
import { gameErrorMessages } from './constants/game';
import { GameError } from './errors/GameError';
import { RoomCreateDto, RoomJoinDto, RoomKickDto, GameMoveDto, RoomRejoinDto, GameReconnectDto } from './dtos/gameDto';

const httpServer = createServer();
const io = new Server(httpServer, {
	cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }
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
			const { playerId, playerName } = payload;
			const roomId = payload.roomId.toUpperCase();
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
			socket.data = {};

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
					targetSocket.data.playerId = null;
					targetSocket.data.playerName = null;
					targetSocket.data.roomId = null;
					targetSocket.emit('room:kicked');
				}
			});

			if (gameState) io.to(roomId).emit('room:update:state', gameState);
		}, socket)
	);

	socket.on(
		'room:rejoin',
		safeSocketHandler(async (payload: RoomRejoinDto) => {
			const { playerId, playerName, roomId, gridSize } = payload;
			const gameState = await rejoinRoom(playerId, playerName, roomId, gridSize);

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
			const { selectedLine, capturedBoxes, nextMove, isLastMove } = payload;
			const { roomId } = socket.data;
			await saveGameProgress(roomId, nextMove, selectedLine, capturedBoxes);

			io.to(roomId).emit('room:game:updateBoard', { selectedLine, capturedBoxes, nextMove });

			if (isLastMove) {
				clearGameDataFromStore(roomId);

				const targetSockets = await io.to(roomId).fetchSockets();
				targetSockets.forEach(targetSocket => {
					targetSocket.leave(roomId);
					targetSocket.data.playerId = null;
					targetSocket.data.playerName = null;
					targetSocket.data.roomId = null;
				});
			}
		}, socket)
	);

	socket.on(
		'room:game:leave',
		safeSocketHandler(async () => {
			const { playerId, roomId } = socket.data;
			const gameState = await leaveGame(playerId, roomId);

			socket.leave(roomId);
			socket.data = {};

			if (gameState) io.to(roomId).emit('room:update:state', gameState);
		}, socket)
	);

	socket.on(
		'room:game:reconnect',
		safeSocketHandler(async (payload: GameReconnectDto) => {
			const { playerId, playerName, roomId } = payload;
			const { gameState, savedGameProgress } = await reconnectGame(playerId, roomId);

			socket.join(roomId);

			socket.data.playerId = playerId;
			socket.data.playerName = playerName;
			socket.data.roomId = roomId;

			io.to(roomId).emit('room:update:state', gameState);
			socket.emit('room:game:reconnect:ack', { gameState, savedGameProgress });
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

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
	console.log(`Socket.io server running on port ${PORT}`);
});
