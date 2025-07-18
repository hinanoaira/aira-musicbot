import dotenv from "dotenv";

dotenv.config();

export const DISCORD_TOKEN = process.env.DISCORD_TOKEN ?? "";

export const LIBRARY_XML_PATH = "../../iTunes Music Library.xml";

export const PORT = 8180;

export const allowedOriginsRegex = /^https?:\/\/(?:localhost(?::\d+)?|botrequest\.hinasense\.jp)$/;
