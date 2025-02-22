export type RoomCreateDto = {
	playerId: string;
	gridSize: string;
};

export type RoomJoinDto = {
	playerId: string;
	roomId: string;
};

export type RoomKickDto = { targetPlayerId: string };

export type GameMoveDto = {
	selectedGridLine: { [key: string]: number };
	shouldSwitchPlayer: boolean;
	isLastMove: boolean;
};
