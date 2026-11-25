import { Hono } from "hono";
import { createConfiguredRelayer } from "./runtime.js";

export default createConfiguredRelayer(process.env, new Hono());
