import { cronJobs } from "convex/server";
import { api } from "./_generated/api";

const crons = cronJobs();

/* 
DEEP FREEZE: All automated polling is currently paused.
crons.interval(
  "poll-allium-whale-activity",
  { minutes: 10 },
  api.allium.pollWhaleActivity,
);
*/

export default crons;
