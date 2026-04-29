import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "poll-allium-whale-activity",
  { minutes: 10 },
  api.allium.pollWhaleActivity,
);

export default crons;
