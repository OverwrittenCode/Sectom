import type { APIMessageComponentEmoji, ButtonStyle } from "discord.js";

export interface ButtonOptions {
    /**
     * Button emoji
     */
    emoji?: APIMessageComponentEmoji;
    /**
     * Button id
     */
    id?: string;
    /**
     * Button label
     */
    label?: string;
    /**
     * Button style
     */
    style?: ButtonStyle;
}

export type ButtonPaginationPositions = {
    start: ButtonOptions;
    next: ButtonOptions;
    previous: ButtonOptions;
    end: ButtonOptions;
    exit: ButtonOptions;
};
