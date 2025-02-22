export type GameState = {
	gameStarted: boolean;
	currentMove: string;
	gridSize: string;
	host: string;
	players: {
		playerId: string;
		isConnected: boolean;
	}[];
};
