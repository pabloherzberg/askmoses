import { runGhlCallScoring } from "../lib/services/ghl-call-scoring"
import { sendGhlCoachingEmail } from "../lib/services/ghl-coaching-email"

const CALL_IDS = [
  "9d04d26f-f594-4285-9ae4-7175033ee3d3",
  "e69ded89-1f64-4666-8ee7-07a479eaa2eb",
  "bddc6878-cf4f-4173-9a11-452d71646205",
  "28031f8a-cbf2-4ca1-8b71-a3766ac592a6",
  "cd517c3d-e5ed-4740-8e29-ee06ba732da9",
  "7bb3f28e-251a-49d9-b59e-23d4c30a2454",
  "c3386104-a3d7-4911-b7b3-799771ec714d",
]

for (const callId of CALL_IDS) {
  const short = callId.substring(0, 8)
  try {
    process.stdout.write(`[${short}] scoring...`)
    await runGhlCallScoring(callId)
    process.stdout.write(" ok — email...")
    await sendGhlCoachingEmail(callId)
    console.log(" enviado.")
  } catch (err) {
    console.log(` ERRO: ${err instanceof Error ? err.message : String(err)}`)
  }
}
