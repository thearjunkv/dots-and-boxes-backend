export type GameState = {
	roomId: string;
	gameStarted: boolean;
	currentMove: string;
	gridSize: string;
	host: string;
	players: {
		playerId: string;
		playerName: string;
		isConnected: boolean;
	}[];
};
