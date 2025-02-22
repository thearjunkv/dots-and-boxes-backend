import { gameErrorMessages } from '../constants/game';
import { gameConfig } from '../constants/gameConfig';
import { GameError } from '../errors/GameError';
import redis from '../redis';
import { GameState } from '../types';
import { generateId } from '../utils';

const getGameState = async (roomId: string) => {
	const gameStateJson = await redis.get(`room:${roomId}:gameState`);
	if (!gameStateJson) throw new GameError(gameErrorMessages.ROOM_NOT_FOUND);

	return JSON.parse(gameStateJson || '{}') as GameState;
};

const getPlayer = async (gameState: GameState, playerId: string) => {
	const player = gameState.players.find(player => player.playerId === playerId);
	if (!player) throw new GameError(gameErrorMessages.PLAYER_NOT_FOUND);
	return player;
};

export const createRoom = async (playerId: string, playerName: string, gridSize: string) => {
	let roomId: string;
	do {
		roomId = generateId();
	} while (await redis.exists(`room:${roomId}:gameState`));

	const gameState: GameState = {
		currentMove: '',
		gameStarted: false,
		gridSize,
		host: playerId,
		players: [
			{
				playerId,
				playerName,
				isConnected: true
			}
		]
	};

	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
	return { roomId, gameState };
};

export const joinRoom = async (playerId: string, playerName: string, roomId: string) => {
	const gameState = await getGameState(roomId);
	if (gameState.gameStarted) throw new GameError(gameErrorMessages.GAME_STARTED);
	if (gameState.players.length === gameConfig.playerCount) throw new GameError(gameErrorMessages.ROOM_FULL);

	gameState.players.push({
		playerId,
		playerName,
		isConnected: true
	});

	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
	return gameState;
};

export const leaveRoom = async (playerId: string, roomId: string) => {
	const gameState = await getGameState(roomId);
	if (gameState.players.length <= 1) {
		await redis.del(`room:${roomId}:gameState`);
		return;
	}
	const player = await getPlayer(gameState, playerId);

	const remainingPlayers = gameState.players.filter(player => player.playerId !== playerId);
	if (gameState.host === player.playerId) gameState.host === remainingPlayers[0].playerId;

	gameState.players = remainingPlayers;

	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
	return gameState;
};

export const kickPlayerFromRoom = async (playerId: string, roomId: string, targetPlayerId: string) => {
	const gameState = await getGameState(roomId);
	const player = await getPlayer(gameState, playerId);

	if (!player) throw new GameError(gameErrorMessages.PLAYER_NOT_FOUND);
	if (player.playerId !== gameState.host) throw new GameError(gameErrorMessages.PERMISSION_DENIED);
	const remainingPlayers = gameState.players.filter(player => player.playerId !== targetPlayerId);

	gameState.players = remainingPlayers;

	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
	return gameState;
};

export const startGame = async (playerId: string, roomId: string) => {
	const gameState = await getGameState(roomId);
	const player = await getPlayer(gameState, playerId);

	if (!player) throw new GameError(gameErrorMessages.PLAYER_NOT_FOUND);
	if (player.playerId !== gameState.host) throw new GameError(gameErrorMessages.PERMISSION_DENIED);
	if (gameState.players.length < 2) throw new GameError(gameErrorMessages.PLAYER_COUNT_LOW);

	gameState.gameStarted = true;
	gameState.currentMove = gameState.players[0].playerId;

	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
	return gameState;
};

export const switchPlayer = async (roomId: string) => {
	const gameState = await getGameState(roomId);
	if (gameState.gameStarted) throw new GameError(gameErrorMessages.GAME_STARTED);

	let currentPlayerIndex = gameState.players.findIndex(pl => pl.playerId === gameState.currentMove);
	const totalPlayers = gameState.players.length;
	if (currentPlayerIndex === -1) throw new GameError(gameErrorMessages.PLAYER_NOT_FOUND);

	let switched: boolean = false;
	while (!switched) {
		currentPlayerIndex += 1;
		if (currentPlayerIndex >= totalPlayers) {
			currentPlayerIndex = 1;
		}
		const player = gameState.players[currentPlayerIndex];
		if (player.isConnected) {
			gameState.currentMove = player.playerId;
		}
	}

	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
	return gameState;
};

export const resetRoom = async (roomId: string) => {
	const gameState = await getGameState(roomId);
	if (gameState.gameStarted) throw new GameError(gameErrorMessages.GAME_STARTED);

	gameState.gameStarted = false;
	gameState.currentMove = '';
	gameState.host = '';
	gameState.players = [];
	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
};

export const rejoinRoom = async (playerId: string, playerName: string, roomId: string) => {
	const gameState = await getGameState(roomId);
	if (gameState.gameStarted) throw new GameError(gameErrorMessages.GAME_STARTED);
	if (gameState.players.length === gameConfig.playerCount) throw new GameError(gameErrorMessages.ROOM_FULL);

	gameState.players.push({
		playerId,
		playerName,
		isConnected: true
	});

	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
	return gameState;
};

export const playerDisconnect = async (playerId: string, roomId: string) => {
	const gameState = await getGameState(roomId);

	if (!gameState.gameStarted) {
		if (gameState.players.length <= 1) {
			await redis.del(`room:${roomId}:gameState`);
			return;
		} else {
			gameState.players = gameState.players.filter(player => player.playerId !== playerId);
			await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
			return { roomId, gameState };
		}
	} else {
		gameState.players = gameState.players.map(player => {
			if (player.playerId === playerId) return { ...player, isConnected: false };
			return player;
		});

		if (gameState.players.filter(pl => pl.isConnected).length === 0) {
			await redis.del(`room:${roomId}:gameState`);
			return;
		}
		await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
		return { roomId, gameState };
	}
};
