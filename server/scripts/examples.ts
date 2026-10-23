import { agentExamples } from "../../shared/agent.examples.js";
import { runViewSchema } from "../../shared/agent.schema.js";
for (const [name, value] of Object.entries(agentExamples)) {
  runViewSchema.parse(value);
  console.log(JSON.stringify({ example: name, synthetic: true, view: value }));
}
