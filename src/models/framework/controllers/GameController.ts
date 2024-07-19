import assert from "assert";

import {
	Collection,
	Colors,
	ComponentType,
	EmbedBuilder,
	GuildMember,
	bold,
	unorderedList,
	userMention
} from "discord.js";
import prettyMilliseconds from "pretty-ms";

import { BOT_ID, LIGHT_GOLD, MAX_BEST_OF_ROUNDS_LIMIT } from "~/constants.js";
import { ValidationError } from "~/helpers/errors/ValidationError.js";
import { EmbedManager } from "~/models/framework/managers/EmbedManager.js";
import { Enums } from "~/ts/Enums.js";
import { InteractionUtils } from "~/utils/interaction.js";
import { ObjectUtils } from "~/utils/object.js";
import { StringUtils } from "~/utils/string.js";

import type {
	APIActionRowComponent,
	APIButtonComponentWithCustomId,
	APIEmbed,
	APIEmbedField,
	ChatInputCommandInteraction,
	UserMention
} from "discord.js";

/**
 * How the computer player responds every update
 * @returns {string} - The button customId to select
 */
export type ComputerPlayerFn = (controller: GameController, enabledButtonIDArr: string[]) => string;
export type GameControllerComponent = APIActionRowComponent<APIButtonComponentWithCustomId>;
export type Opponent = GuildMember | ComputerPlayerFn;

type PlayerMention = UserMention | "I" | "You";

type SpecialRule = keyof typeof SpecialRuleDescriptionMap;

interface Factor {
	options: FactorOptions;
	status: boolean | number | undefined;
}

interface FactorOptions {
	or?: boolean | number | (() => number);
	type: OperationType;
	value: number | (() => number);
}

interface GameControllerOptions {
	readonly clearBoardOnPoint?: boolean;
	readonly computerBiasedGameMaster?: boolean;
	readonly deuce?: boolean;
	readonly disableOnClick?: boolean;
	readonly gameMode: Enums.GameMode;
	readonly maxDecisionTime?: number;
	readonly onActionCollect: (controller: GameController, playerActions: Collection<string, PlayerAction>) => unknown;
	readonly rounds: number;
	readonly teams?: Record<string, string>;
	readonly title: string;
	readonly turnBased?: boolean;

	modifiers?: APIEmbedField[];
	opponent?: Opponent;
}

interface PlayerAction {
	readonly customId: string;

	profile: Player;
}

interface PlayerOptions {
	computerFn?: ComputerPlayerFn;
	member: GuildMember;
	onChange: (player: Player) => void;
	score: number;
	team?: string;
}

export class GameController {
	private readonly baseEmbed: APIEmbed;
	private readonly collectorPlayerIDs: string[];

	private specialRuleCounter: number;
	private teamList: string[];

	public static readonly BASE_RANGE_SPECIAL_RULE_THRESHOLD = {
		min: 12,
		max: 15
	};
	public static readonly MAX_SPECIAL_RULE_THRESHOLD = 75;
	public static readonly NOTICE_PROCESSING_TIME = 1_000;
	public static readonly bestOfChoices = Array.from(
		{ length: Math.floor((MAX_BEST_OF_ROUNDS_LIMIT + 1) / 2) },
		(_, i) => 2 * i + 1
	);

	public readonly blankBoard: GameControllerComponent[];
	public readonly interaction: ChatInputCommandInteraction<"cached">;
	public readonly settings: Omit<GameControllerOptions, "opponent">;

	public components: GameControllerComponent[];
	public currentPlayerIndex: number;
	public enabledButtonIDs: Set<string>;
	public gameStatus: string | null;
	public playerActionsPerGame: Collection<string, PlayerAction>;
	public playerActionsPerRound: Collection<string, PlayerAction>;
	public players: Player[];
	public previousSpecialRule: SpecialRule | null;
	public previousWinThreshold?: number | undefined;
	public specialRule: SpecialRule | null;
	public winThreshold: number;

	constructor(
		interaction: ChatInputCommandInteraction<"cached">,
		components: GameControllerComponent[],
		options: GameControllerOptions
	) {
		options.opponent ??= (controller) => {
			const choices = controller.components.flatMap(({ components }) =>
				components.filter(({ disabled }) => !disabled)
			);

			return ObjectUtils.randomElement(choices).custom_id;
		};

		const { opponent, ...settings } = options;

		assert(options.teams || options.gameMode !== Enums.GameMode["Swap Teams"]);

		this.interaction = interaction;
		this.settings = settings;
		this.baseEmbed = new EmbedBuilder().setTitle(this.settings.title).setColor(Colors.Purple).toJSON();
		this.collectorPlayerIDs = [interaction.user.id];

		const isMultiplayerGame = (opponent: Opponent): opponent is GuildMember =>
			opponent instanceof GuildMember && !opponent.user.bot;

		if (isMultiplayerGame(opponent)) {
			this.collectorPlayerIDs.push(opponent.id);
		}

		this.blankBoard = components;
		this.components = components;
		this.enabledButtonIDs = this.resetEnabledButtons(components);
		this.winThreshold = (this.settings.rounds + 1) / 2;
		this.gameStatus = null;
		this.specialRule = null;
		this.previousSpecialRule = null;
		this.currentPlayerIndex = -1;
		this.playerActionsPerGame = new Collection();
		this.playerActionsPerRound = new Collection();
		this.specialRuleCounter = 0;
		this.teamList = Object.values(this.settings.teams ?? {});

		const onChange = this.onPlayerChange.bind(this);

		this.players = Array.from({ length: Math.max(this.teamList?.length ?? 0, 2) }, (_, i) => {
			const team = this.teamList[i];

			if (!i) {
				return new Player({ member: interaction.member, team, onChange });
			}

			return new Player({
				member: isMultiplayerGame(opponent) ? opponent : interaction.guild.members.me!,
				team,
				onChange,
				computerFn: isMultiplayerGame(opponent) ? void 0 : opponent
			});
		});
	}

	private get computerPlayer(): Player | undefined {
		return this.players.find((player) => player.member.id === BOT_ID);
	}

	private get highestScore(): number {
		return Math.max(...this.scores);
	}

	private get isMatchPoint(): boolean {
		return this.highestScore === this.winThreshold - 1;
	}

	private get scores(): number[] {
		return this.players.map((player) => player.score);
	}

	private get specialRuleNotice() {
		if (!this.specialRule) {
			return null;
		}

		const specialRuleDescription = this.specialRule
			? ObjectUtils.randomElement(SpecialRuleDescriptionMap[this.specialRule])
			: null;

		let innerText = "GAME MASTER";

		if (this.settings.gameMode === Enums.GameMode.Chaos) {
			innerText += ` (${this.specialRule})`;
		}

		return bold(`[${innerText}]: ${specialRuleDescription}`);
	}

	public async init() {
		const { deuce = true, title, rounds, maxDecisionTime, modifiers = [], gameMode } = this.settings;

		modifiers.unshift(
			{ name: "Deuce", value: deuce ? "enabled" : "disabled", inline: true },
			{ name: "Game Mode", value: gameMode, inline: true }
		);

		const baseEmbed = new EmbedBuilder().setTitle(`${title} Game`).setColor(Colors.Purple).toJSON();
		let multiplayerWaitingLobbyText: string | undefined = void 0;

		const fields: APIEmbedField[] = [
			{
				name: "Best of",
				value: rounds.toString(),
				inline: true
			}
		];

		if (this.collectorPlayerIDs.length > 1) {
			multiplayerWaitingLobbyText = "Waiting lobby";

			fields.push(
				{
					name: `Players (${this.collectorPlayerIDs.length})`,
					value: this.collectorPlayerIDs.map((str) => userMention(str)).join(", ")
				},
				{
					name: multiplayerWaitingLobbyText,
					value: StringUtils.TabCharacter
				}
			);

			fields.reverse();
		}

		if (maxDecisionTime) {
			fields.push({
				name: "Max Decision Time",
				value: prettyMilliseconds(maxDecisionTime, { verbose: true }),
				inline: true
			});
		}

		const confirmationEmbed = new EmbedBuilder(baseEmbed).addFields(fields.concat(modifiers));

		const resolveTime = 100;

		await InteractionUtils.confirmationButton(this.interaction, {
			confirmLabel: "Ready",
			cancelLabel: "Abandon",
			userIDs: this.collectorPlayerIDs,
			multiplayerWaitingLobbyText,
			resolveTime,
			embeds: [confirmationEmbed]
		});

		console.log("[GAME START] > Started new game", {
			deuce,
			title,
			rounds,
			maxDecisionTime,
			gameMode
		});

		while (true) {
			const playerActions = await this.requestPlayerActions();

			if (this.specialRule && postNoticeSpecialRules.includes(this.specialRule)) {
				await this.interaction.editReply({
					content: this.specialRuleNotice
				});

				await ObjectUtils.sleep(GameController.NOTICE_PROCESSING_TIME);
			}

			if (playerActions) {
				this.settings.onActionCollect(this, playerActions);
			}

			const isGameRenew = this.highestScore < this.winThreshold;

			if (this.gameStatus) {
				if (this.settings.clearBoardOnPoint) {
					await this.interaction.editReply({ components: this.components });

					await ObjectUtils.sleep(GameController.NOTICE_PROCESSING_TIME * 2);

					if (isGameRenew) {
						this.components = this.blankBoard;
						console.log("[GAME UPDATE] > Board has been cleared");
					}
				}

				await this.interaction.editReply({
					content: this.gameStatus,
					components: InteractionUtils.toDisabledComponents(this.components)
				});

				if (isGameRenew) {
					console.log("[GAME RENEW] > Nobody has won yet", {
						winThreshold: this.winThreshold,
						scores: this.scores
					});

					this.gameStatus = null;
				}

				await ObjectUtils.sleep(GameController.NOTICE_PROCESSING_TIME * 2);
			} else {
				await ObjectUtils.sleep(resolveTime);
			}

			if (!isGameRenew) {
				break;
			}
		}

		console.log("[GAME END] > Game concluded.");

		const endGameEmbed = new EmbedBuilder().setFooter({
			text: `Final Score: ${this.scores.join(" - ")}`
		});

		const computerPlayer = this.computerPlayer;

		let description: string;
		let colour: number = Colors.Green;

		if (!computerPlayer) {
			const playerMention = this.gameStatus!.split(" ")[0];

			description = `${playerMention} has won!`;
		} else if (this.highestScore === computerPlayer.score) {
			description = "Better luck next time! You lost.";
			colour = Colors.Red;
		} else {
			description = "Congratulations! You have won!";
		}

		endGameEmbed.setColor(colour).setDescription(description);

		return await this.interaction.editReply({
			content: null,
			embeds: [endGameEmbed]
		});
	}

	public playerMention(player: Player): PlayerMention {
		const computerPlayer = this.computerPlayer;

		if (!computerPlayer) {
			return player.member.toString();
		}

		return player.member.id === computerPlayer.member.id ? "I" : "You";
	}

	public setGameStatus(player: Player, description?: string | null): string;
	public setGameStatus(tieReason?: string): string;
	public setGameStatus(data: string | Player = "Nobody won", description: string | null = ""): string {
		this.playerActionsPerGame.clear();

		if (this.settings.disableOnClick) {
			this.enabledButtonIDs = this.resetEnabledButtons();

			console.log("[GAME UPDATE] > All buttons have been enabled");
		}

		if (this.settings.turnBased) {
			this.currentPlayerIndex = -1;

			console.log("[GAME UPDATE] > Set the current player index back to -1");
		}

		if (this.teamList.length) {
			this.players.forEach((player) => player.resetTeam());
			this.teamList = Object.values(this.settings.teams ?? {});

			console.log("[GAME UPDATE] > Teams have been reset");
		}

		if (typeof data === "string") {
			this.gameStatus = `It's a tie! ${data}`;
		} else {
			data.score++;

			const playerMention = this.playerMention(data);

			this.gameStatus = `${playerMention} ${playerMention.startsWith("<") ? "has" : "have"} won! ${description}`;
		}

		return this.gameStatus;
	}

	private onPlayerChange(player: Player): void {
		this.playerActionsPerGame.forEach((action) => {
			if (action.profile.id === player.id) {
				action.profile = player;
			}
		});
	}

	private async recordComputerAction(): Promise<Collection<string, PlayerAction>> {
		const enabledButtonIDArr = Array.from(this.enabledButtonIDs);

		const profile = this.computerPlayer!;

		await ObjectUtils.sleep(200);

		const customId =
			typeof profile.computerFn === "function"
				? profile.computerFn(this, enabledButtonIDArr)
				: ObjectUtils.randomElement(enabledButtonIDArr);

		return this.recordPlayerAction({ customId, profile });
	}

	private recordPlayerAction(action: PlayerAction): Collection<string, PlayerAction> {
		if (this.settings.disableOnClick) {
			if (this.specialRule !== Enums.GameMode.Overrule) {
				this.enabledButtonIDs.delete(action.customId);
			}

			this.components = InteractionUtils.toDisabledComponents(this.components, {
				customIds: Array.from(this.enabledButtonIDs.values()),
				delete: false
			});
		}

		if (this.specialRule === Enums.GameMode["Swap Move"]) {
			const playerIndex = this.players.findIndex((player) => player.member.id === action.profile.member.id);
			const nextIndex = (playerIndex + 1) % this.players.length;

			action.profile = this.players[nextIndex];
		}

		this.playerActionsPerGame.set(action.customId, action);
		this.playerActionsPerRound.set(action.customId, action);

		console.log(
			[
				"[PLAYER RECORD]",
				` > [BUTTON PRESSED] > ${action.customId}`,
				` > [ACTION BY] > ${action.profile.member.displayName}`,
				` > [TEAM / LABEL DISPLAY] > ${action.profile.team}`,
				` > [MOVE#] > ${this.playerActionsPerGame.size}`,
				` > [SPECIAL RULE] > ${this.specialRule}`
			].join(StringUtils.LineBreak)
		);

		return this.playerActionsPerRound;
	}

	private async requestPlayerActions(): Promise<Collection<string, PlayerAction> | void> {
		const { turnBased, maxDecisionTime } = this.settings;
		const isOffline = !!this.computerPlayer;

		const totalActions = this.playerActionsPerGame.size;
		const previousPlayerIndex = this.currentPlayerIndex;

		let allowSpecialRules = this.settings.gameMode !== Enums.GameMode.Classic;

		if (this.settings.turnBased) {
			allowSpecialRules &&= totalActions > 2;
		}

		if (allowSpecialRules) {
			const isChaos = this.settings.gameMode === Enums.GameMode.Chaos;

			if (isChaos) {
				this.specialRule = ObjectUtils.randomElement(
					Object.values(Enums.GameMode).filter(
						(str) => ![Enums.GameMode.Classic, Enums.GameMode.Chaos].includes(str)
					)
				) as SpecialRule;
			} else {
				this.specialRule = this.settings.gameMode as SpecialRule;
			}

			const factors: Factor[] = [
				{
					status: isChaos,
					options: {
						type: OperationType.Multiplier,
						value: 2
					}
				},
				{
					status: this.isMatchPoint,
					options: {
						type: OperationType.Multiplier,
						value: 2
					}
				},
				{
					status: this.specialRule === Enums.GameMode.Overrule,
					options: {
						type: OperationType.Increment,
						value: this.settings.computerBiasedGameMaster
							? this.players[previousPlayerIndex].member.id === this.computerPlayer?.member.id
								? -50
								: 50
							: -10
					}
				},
				{
					status: !!this.previousSpecialRule,
					options: {
						type: OperationType.Increment,
						value: () => (this.specialRuleCounter = 0) - 10,
						or: () => this.specialRuleCounter++ * 10
					}
				}
			];

			const baseRangeThreshold =
				GameController.BASE_RANGE_SPECIAL_RULE_THRESHOLD.max -
				GameController.BASE_RANGE_SPECIAL_RULE_THRESHOLD.min;

			const baseSpecialRuleThreshold =
				Math.random() * baseRangeThreshold +
				GameController.BASE_RANGE_SPECIAL_RULE_THRESHOLD.min +
				totalActions;

			const specialRuleThreshold = factors.reduce((acc, factor) => {
				let amount = typeof factor.options.value === "number" ? factor.options.value : factor.options.value();

				if (!factor.status) {
					if (factor.options.or === true) {
						amount *= -1;
					} else if (typeof factor.options.or === "number") {
						amount = factor.options.or;
					} else if (typeof factor.options.or === "function") {
						amount = factor.options.or();
					} else {
						return acc;
					}
				}

				if (factor.options.type === OperationType.Multiplier) {
					acc *= amount;
				} else if (factor.options.type === OperationType.Increment) {
					acc += amount;
				}

				return acc;
			}, baseSpecialRuleThreshold);

			const isBelowThreshold =
				Math.min(specialRuleThreshold, GameController.MAX_SPECIAL_RULE_THRESHOLD) < Math.random() * 101;

			if (isBelowThreshold) {
				this.specialRule = null;
			} else {
				console.log(`[SPECIAL RULE] > ${this.specialRule} has been chosen for this round`);
			}
		} else {
			this.specialRule = null;
		}

		const incrementValue = +(this.specialRule === Enums.GameMode["Skip Turn"]) + 1;

		this.currentPlayerIndex = (previousPlayerIndex + incrementValue) % this.players.length;

		console.log("[TURN DECISION] > Updated", {
			incrementValue,
			previousPlayer: this.players[Math.max(previousPlayerIndex, 0)].member.displayName,
			currentPlayer: this.players[this.currentPlayerIndex].member.displayName,
			previousPlayerIndex,
			totalActions
		});

		if (this.specialRule === Enums.GameMode.Jumble) {
			this.enabledButtonIDs.clear();

			const previousPlayerActionsPerGame = this.playerActionsPerGame.clone();

			this.playerActionsPerGame.clear();

			const allButtons = this.components.flatMap(({ components }) => components);

			for (let i = allButtons.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));

				[allButtons[i], allButtons[j]] = [allButtons[j], allButtons[i]];
			}

			let index = 0;

			this.components = this.components.map((component) => ({
				...component,
				components: component.components.map((subComponent) => {
					const { custom_id } = subComponent;
					const element = allButtons[index++];
					const disabled = element.label !== StringUtils.TabCharacter;

					if (disabled) {
						const profile = previousPlayerActionsPerGame.get(element.custom_id)!.profile;

						this.playerActionsPerGame.set(custom_id, {
							customId: custom_id,
							profile
						});
					} else {
						this.enabledButtonIDs.add(custom_id);
					}

					return {
						...element,
						disabled,
						custom_id
					};
				})
			}));

			this.settings.onActionCollect(this, this.playerActionsPerGame);

			if (this.gameStatus) {
				return;
			}
		}

		if (this.specialRule === Enums.GameMode["Swap Teams"]) {
			this.teamList = this.teamList.map((_, i, arr) => arr[(i + 1) % arr.length]);

			this.players.forEach((player, i) => {
				const newTeam = this.teamList[i];

				console.log(
					`[PLAYER SWITCH TEAM] > Player ${player.member.displayName} moving from [${player.team}] to [${newTeam}]`
				);

				player.setTeam(newTeam);
			});
		}

		if (this.specialRule === Enums.GameMode.Overrule) {
			const otherPlayerActions = this.playerActionsPerGame.filter(
				(action) => action.profile.team !== this.players[this.currentPlayerIndex].team
			);

			this.components = this.components.map((component) => {
				component.components = component.components.map((button) => {
					if (otherPlayerActions.has(button.custom_id)) {
						this.enabledButtonIDs.add(button.custom_id);

						button.disabled = false;
					}

					return button;
				});

				return component;
			});
		}

		if (this.previousSpecialRule === Enums.GameMode.Overrule) {
			this.components = this.components.map((component) => {
				component.components = component.components.map((button) => {
					if (this.playerActionsPerGame.find(({ customId }) => customId === button.custom_id)) {
						this.enabledButtonIDs.delete(button.custom_id);

						button.disabled = true;
					}

					return button;
				});

				return component;
			});
		}

		this.previousSpecialRule = this.specialRule;

		this.playerActionsPerRound.clear();

		const scoreEmbed = new EmbedBuilder(this.baseEmbed).addFields(
			this.players.map((player) => {
				const possessivePronoun = isOffline
					? player.member.user.bot
						? "My"
						: "Your"
					: `${player.member.displayName}'s`;

				return {
					name: `${possessivePronoun} Score`,
					value: player.score.toString(),
					inline: true
				};
			})
		);

		if (this.winThreshold > 1 && this.isMatchPoint) {
			const highestScore = this.highestScore;

			const highestScoredPlayers = this.players.filter((player) => player.score === highestScore);
			const leadingPlayer = highestScoredPlayers[0];

			const leadingPlayerName =
				highestScoredPlayers.length > 1
					? null
					: isOffline
						? leadingPlayer.member.user.bot
							? "Me"
							: "You"
						: leadingPlayer.member.displayName;

			if (leadingPlayerName) {
				let text = "Match Point!";

				if (this.previousWinThreshold && this.winThreshold !== this.previousWinThreshold) {
					text += ` Adv: ${leadingPlayerName}`;

					if (this.computerPlayer) {
						scoreEmbed.setColor(Colors.Red);
					}
				}

				scoreEmbed.setFooter({ text });
			} else if (this.settings.deuce) {
				this.previousWinThreshold = this.winThreshold++;

				scoreEmbed
					.setColor(LIGHT_GOLD)
					.setDescription(
						[
							bold("[DEUCE]:"),
							unorderedList([
								"You must win by two points",
								`The game now ends on scoring ${this.winThreshold} points`
							])
						].join(StringUtils.LineBreak)
					)
					.setFooter({ text: "Deuce!" });
			}
		}

		const currentPlayer = this.players[this.currentPlayerIndex];

		let content: string | null = null;

		const isDisplayableTurn = turnBased && this.computerPlayer?.member.id !== currentPlayer.member.id;

		if (isDisplayableTurn) {
			content = `Turn: ${currentPlayer.member.toString()}`;
		}

		if (this.specialRule && !postNoticeSpecialRules.includes(this.specialRule)) {
			content ??= "";

			if (content) {
				content += StringUtils.LineBreak;
			}

			content += this.specialRuleNotice;
		}

		const reply = await this.interaction.editReply({
			content,
			embeds: EmbedManager.formatEmbeds([scoreEmbed]),
			components: this.components
		});

		const filterPlayerIds: string[] = [];

		if (turnBased) {
			if (currentPlayer.member.user.bot) {
				if (this.specialRule) {
					await ObjectUtils.sleep(1000);
				}

				return await this.recordComputerAction();
			}

			filterPlayerIds.push(currentPlayer.member.id);
		} else {
			if (this.computerPlayer) {
				await this.recordComputerAction();
			}

			filterPlayerIds.push(...this.collectorPlayerIDs);
		}

		try {
			return await new Promise((resolve, reject) => {
				const collector = reply.createMessageComponentCollector({
					componentType: ComponentType.Button,
					time: maxDecisionTime,
					maxUsers: filterPlayerIds.length,
					filter: (i) => {
						const {
							user: { id },
							customId
						} = i;

						if (!filterPlayerIds.includes(id)) {
							return false;
						}

						const profile = this.players.find((profile) => profile.member.id === id)!;

						this.recordPlayerAction({ customId, profile });

						return true;
					}
				});

				collector.on("end", async (collection) => {
					if (collection.size !== filterPlayerIds.length) {
						const content = ValidationError.MessageTemplates.Timeout;

						await InteractionUtils.disableComponents(reply, {
							messageEditOptions: { content, embeds: [] }
						});

						reject(ValidationError.MessageTemplates.Timeout);
					}

					resolve(this.playerActionsPerRound);
				});
			});
		} catch (err) {
			throw new ValidationError(err);
		}
	}

	private resetEnabledButtons(components: GameControllerComponent[] = this.components): Set<string> {
		return new Set(components.flatMap(({ components }) => components.map((c) => c.custom_id)));
	}
}

class Player {
	private readonly _originalTeam?: string;

	public readonly id: string;
	public readonly member: GuildMember;
	public readonly onChange: (player: Player) => void;

	public computerFn?: ComputerPlayerFn;
	public score: number;
	public team?: string;

	constructor(options: Omit<PlayerOptions, "score">) {
		this.id = StringUtils.GenerateID();
		this.member = options.member;
		this.score = 0;
		this.team = options.team;
		this._originalTeam = this.team;
		this.onChange = options.onChange;
		this.computerFn = options.computerFn;
	}

	public resetTeam(): this {
		this.team = this._originalTeam;
		this.onChange(this);

		return this;
	}

	public setTeam(newTeam: string): this {
		this.team = newTeam;
		this.onChange(this);

		return this;
	}
}

enum OperationType {
	Multiplier,
	Increment
}

const SpecialRuleDescriptionMap = {
	[Enums.GameMode.Overrule]: [
		"All buttons are yours! You can overrule any button. Go wild!",
		"Feeling powerful? Every button is at your command. Overrule away!",
		"Ha! Now you can overrule any button. Use your power wisely!",
		"It's your lucky day! All buttons are enabled. Overrule them all!",
		"Absolute power! You may overrule any button you wish. Enjoy!",
		"Every button bows to you! Overrule at will. The game is yours!",
		"Command central! You have the power to overrule any button!",
		"Mwahaha! All buttons are active. Overrule to your heart's content!",
		"No restrictions! Every button is yours to overrule. Have fun!",
		"Unlimited power! You can overrule any button. Go ahead, play master!"
	],
	[Enums.GameMode.Jumble]: [
		"Time for some chaos! We're jumbling things around. Good luck!",
		"Things are about to get interesting! We're mixing it all up!",
		"Hold tight! We're jumbling the components. Try to keep track!",
		"Ready for a shake-up? Things are moving around. Stay sharp!",
		"Let's make it fun! We're jumbling everything. Keep an eye out!",
		"Chaos is here! We're moving things around. Good luck finding your way!",
		"Jumble time! Everything's on the move. Can you keep up?",
		"Mix and match! We're jumbling things up. Let's see how you handle it!",
		"Expect the unexpected! Things are getting jumbled. Stay alert!",
		"Mwahaha! We're moving things around. Let's see if you can keep track!"
	],
	[Enums.GameMode["Swap Move"]]: [
		"Gotcha! Didn't see that coming, did you?",
		"Surprise! Bet you didn't plan for this!",
		"Ha! Just when you thought you had it figured out.",
		"Think you were clever? Think again!",
		"Oops! Hope you're ready for a change!",
		"Caught you off guard, didn't I?",
		"Bet you didn't expect this!",
		"Mwahaha! Let's see how well you adapt now!",
		"Thought you had the perfect move? Think again!",
		"Just when you had it all planned out..."
	],
	[Enums.GameMode["Swap Teams"]]: [
		"Let's spice things up! Time for a team swap! Who's ready for a twist?",
		"Surprise, surprise! Teams are switching sides this round. Enjoy the chaos!",
		"Ha! Didn't see this coming, did you? Teams will swap places. Have fun!",
		"Guess what? It's swap time! Teams will trade sides. Let's see how you handle it!",
		"Feeling dizzy yet? Teams will switch sides this round. Good luck keeping up!",
		"Oh, the fun we'll have! Teams are swapping sides. Try not to get too confused!",
		"Plot twist! Teams will change places this round. Who's up for a challenge?",
		"I've got a trick up my sleeve! Teams are switching sides. Let the games continue!",
		"Hold onto your hats! Teams are swapping places this round. Enjoy the ride!",
		"Mwahaha! Teams will swap sides this round. Let's see how well you adapt!"
	],
	[Enums.GameMode["Skip Turn"]]: [
		"Life's unfair, isn't it? Skip your turn and let the others play!",
		"Tough luck! You have to skip your turn. Better luck next time!",
		"Ha! You're sitting this one out. Skip your turn and watch the fun!",
		"Oops! Looks like you have to skip your turn. Enjoy the break!",
		"No turn for you! Skip this round and let the others have a go!",
		"Sorry, not sorry! You have to skip your turn. Watch and learn!",
		"Better luck next time! You're skipping this turn. Sit tight!",
		"Oh no! You've got to skip your turn. Cheer on your teammates!",
		"Tough break! Skip your turn and see how the others do!",
		"Mwahaha! You have to skip your turn. Let's see what happens next!"
	]
};
const postNoticeSpecialRules = [Enums.GameMode["Swap Move"]];
