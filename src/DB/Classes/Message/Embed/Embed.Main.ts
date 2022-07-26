import { prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";

import {
  APIEmbed,
  APIEmbedThumbnail,
  APIEmbedVideo,
} from "discord-api-types/payloads/v9/channel";
import DataLog from "../../Base/Base.DataLog";
import MessageEmbedFooter from "./Embed.Footer";
import {
  MessageEmbedImage,
  MessageEmbedThumbnail,
  MessageEmbedVideo,
} from "./Embed.Image";
import MessageEmbedAuthor from "./Embed.Author";
import MessageEmbedField from "./Embed.Field";

export default class MessageEmbed extends DataLog implements APIEmbed {
  @prop()
  public title?: string;

  @prop()
  public description?: string;

  @prop()
  public url?: string;

  @prop()
  public timestamp?: string;

  @prop()
  public color?: number;

  @prop({ type: MessageEmbedFooter })
  public footer?: MessageEmbedFooter;

  @prop({ type: MessageEmbedImage })
  public image?: MessageEmbedImage;

  @prop({ type: MessageEmbedThumbnail })
  public thumbnail?: MessageEmbedThumbnail;

  @prop({ type: MessageEmbedVideo })
  public video?: MessageEmbedVideo;

  @prop({ type: MessageEmbedAuthor })
  public author?: MessageEmbedAuthor;

  @prop({ type: MessageEmbedField })
  public fields?: mongoose.Types.DocumentArray<MessageEmbedField>;
}
