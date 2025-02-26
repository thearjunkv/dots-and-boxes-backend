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

export type RoomRejoinDto = RoomJoinDto;

export type RoomKickDto = { targetPlayerId: string };

export type GameReconnectDto = RoomJoinDto;

export type GameMoveDto = {
	selectedGridLine: { [key: string]: number };
	shouldSwitchPlayer: boolean;
	isLastMove: boolean;
};
