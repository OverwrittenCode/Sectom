import { prop } from "@typegoose/typegoose";

export default class UpdateLog {
  @prop({ required: true, immutable: true })
  public readonly userID!: string;

  @prop({ required: true, match: /^((.+?)#\d{4})/ })
  public userTag: string;

  @prop()
  public userAvatar?: string;

  @prop()
  public reason?: string;
}
