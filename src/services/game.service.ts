import { gameErrorMessages } from '../constants/game';
import { gameConfig } from '../constants/gameConfig';
import { GameError } from '../errors/GameError';
import redis from '../redis';
import { GameState, SavedGameProgress } from '../types';
import { generateId } from '../utils';

export const getGameState = async (roomId: string) => {
	const gameStateJson = await redis.get(`room:${roomId}:gameState`);
	if (!gameStateJson) throw new GameError(gameErrorMessages.ROOM_NOT_FOUND);

	return JSON.parse(gameStateJson || '{}') as GameState;
};

export const getSavedGameProgress = async (roomId: string) => {
	const savedGameProgressJson = await redis.get(`room:${roomId}:savedGameProgress`);
	if (!savedGameProgressJson) throw new GameError(gameErrorMessages.ROOM_NOT_FOUND);

	return JSON.parse(savedGameProgressJson || '{}') as SavedGameProgress;
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
		roomId,
		gameStarted: false,
		nextMove: '',
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

	const savedGame: SavedGameProgress = {
		selectedLines: [],
		capturedBoxes: []
	};

	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
	await redis.set(`room:${roomId}:savedGameProgress`, JSON.stringify(savedGame));
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
		await redis.del(`room:${roomId}:savedGameProgress`);
		return;
	}
	const player = await getPlayer(gameState, playerId);

	const remainingPlayers = gameState.players.filter(player => player.playerId !== playerId);
	if (gameState.host === player.playerId) gameState.host = remainingPlayers[0].playerId;

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
	gameState.nextMove = gameState.players[0].playerId;

	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
	return gameState;
};

export const saveGameProgress = async (
	roomId: string,
	nextMove: string,
	selectedLine: { id: string; by: string },
	capturedBoxes: { id: string; by: string }[]
) => {
	const gameState = await getGameState(roomId);
	gameState.nextMove = nextMove;

	const savedGameProgress = await getSavedGameProgress(roomId);
	savedGameProgress.selectedLines.push([selectedLine.id, selectedLine.by]);
	capturedBoxes.forEach(box => {
		savedGameProgress.capturedBoxes.push([box.id, box.by]);
	});

	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
	await redis.set(`room:${roomId}:savedGameProgress`, JSON.stringify(savedGameProgress));
};

export const resetRoom = async (roomId: string) => {
	const gameState = await getGameState(roomId);
	if (gameState.gameStarted) throw new GameError(gameErrorMessages.GAME_STARTED);

	gameState.gameStarted = false;
	gameState.host = '';
	gameState.nextMove = '';
	gameState.players = [];
	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
};

export const leaveGame = async (playerId: string, roomId: string) => {
	const gameState = await getGameState(roomId);
	const player = await getPlayer(gameState, playerId);

	gameState.players = gameState.players.map(pl => (pl.playerId === playerId ? { ...pl, isConnected: false } : pl));

	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
	return gameState;
};

export const rejoinRoom = async (playerId: string, playerName: string, roomId: string) => {
	const gameState = await getGameState(roomId);
	if (gameState.gameStarted) throw new GameError(gameErrorMessages.GAME_STARTED);
	if (gameState.players.length === gameConfig.playerCount) throw new GameError(gameErrorMessages.ROOM_FULL);
	if (gameState.players.find(pl => pl.playerId === playerId)) return gameState;

	if (gameState.host === '') gameState.host = playerId;
	gameState.players.push({
		playerId,
		playerName,
		isConnected: true
	});

	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
	return gameState;
};

export const reconnectGame = async (playerId: string, roomId: string) => {
	const gameState = await getGameState(roomId);
	const savedGameProgress = await getSavedGameProgress(roomId);
	if (!gameState.gameStarted) throw new GameError(gameErrorMessages.DISCONNECTED);
	const player = getPlayer(gameState, playerId);

	gameState.players = gameState.players.map(pl => (pl.playerId === playerId ? { ...pl, isConnected: true } : pl));

	await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
	return { gameState, savedGameProgress };
};

export const playerDisconnect = async (playerId: string, roomId: string) => {
	const gameState = await getGameState(roomId);

	if (!gameState.gameStarted) {
		gameState.players = gameState.players.filter(player => player.playerId !== playerId);

		if (gameState.players.length === 0) {
			await redis.del(`room:${roomId}:gameState`);
			await redis.del(`room:${roomId}:savedGameProgress`);
			return;
		}

		if (gameState.host === playerId) gameState.host = gameState.players[0].playerId;
		await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
		return { roomId, gameState };
	} else {
		gameState.players = gameState.players.map(player => {
			if (player.playerId === playerId) return { ...player, isConnected: false };
			return player;
		});

		if (gameState.players.filter(pl => pl.isConnected).length === 0) {
			await redis.del(`room:${roomId}:gameState`);
			await redis.del(`room:${roomId}:savedGameProgress`);
			return;
		}
		await redis.set(`room:${roomId}:gameState`, JSON.stringify(gameState));
		return { roomId, gameState };
	}
};
