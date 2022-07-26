import { prop } from "@typegoose/typegoose";
import { APIEmbedFooter } from "discord-api-types/payloads/v9/channel";
import DataLog from "../../Base/Base.DataLog";

export default class MessageEmbedFooter
  extends DataLog
  implements APIEmbedFooter
{
  @prop({ required: true, maxlength: 2048 })
  public text: string;

  @prop()
  public icon_url?: string;
}
