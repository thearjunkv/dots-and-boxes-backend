export type GameState = {
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
