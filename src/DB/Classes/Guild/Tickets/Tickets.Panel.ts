import { modelOptions, prop } from "@typegoose/typegoose";
import mongoose from "mongoose";
import { Namespaces } from "@DB/index";
import GuildTicketConfig from "./Tickets.Config";

export default class GuildTicketPanel
  extends GuildTicketConfig
  implements Namespaces.Interfaces.Guild.Tickets.Panel
{
  @prop({ required: true })
  public name!: string;

  @prop()
  public storageCapacity?: number;

  @prop()
  public userCreationLimit?: number;
}
