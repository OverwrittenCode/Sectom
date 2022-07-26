import { prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";
import { MessageEmbedImage } from "./Embed/Embed.Image";
import MessageEmbed from "./Embed/Embed.Main";

export default class Message
  extends Namespaces.Classes.Base.DataLog
  implements Namespaces.Interfaces.Message.Main
{
  @prop()
  public attachments?: mongoose.Types.DocumentArray<MessageEmbedImage>;
  @prop()
  public content?: string;
  @prop()
  public embeds?: mongoose.Types.DocumentArray<MessageEmbed>;
}
