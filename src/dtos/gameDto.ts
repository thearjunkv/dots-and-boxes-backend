export type RoomCreateDto = {
	playerId: string;
	playerName: string;
	gridSize: string;
};

export type RoomJoinDto = {
	playerId: string;
	playerName: string;
	roomId: string;
};

export type RoomKickDto = { targetPlayerId: string };

export type GameMoveDto = {
	selectedGridLine: { [key: string]: number };
	shouldSwitchPlayer: boolean;
	isLastMove: boolean;
};
