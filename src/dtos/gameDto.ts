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

export type RoomRejoinDto = RoomJoinDto & { gridSize: string };

export type RoomKickDto = { targetPlayerId: string };

export type GameReconnectDto = RoomJoinDto;

export type GameMoveDto = {
	selectedLine: { id: string; by: string };
	capturedBoxes: { id: string; by: string }[];
	nextMove: string;
	isLastMove: boolean;
};
