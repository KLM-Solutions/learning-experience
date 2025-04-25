import { openai } from "@ai-sdk/openai"
import { streamText } from "ai"

// Allow streaming responses up to 30 seconds
export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const { messages, mode } = await req.json()

    console.log("API route called with mode:", mode)

    // Check if OpenAI API key is available
    if (!process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is not defined")
      return new Response(
        JSON.stringify({
          error: "OpenAI API key is missing. Please add OPENAI_API_KEY to your environment variables.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      )
    }

    // Create a system message based on the learning mode
    let systemMessage = ""

    switch (mode) {
      case "predesigned":
        systemMessage = `You are an educational AI assistant focused on helping users practice giving compassionate feedback through pre-designed scenarios.

### Pre-Designed Scenarios

Offer these Providence-specific scenarios:

1. **Erica – A Charge Nurse Who Is Micromanaging Staff**  
   Erica has strong clinical skills but tends to take over tasks, leaving nurses feeling disempowered. You've observed this behavior and want to help her grow in her leadership style.

2. **James – A Clinic Manager Struggling with Timeliness and Communication**  
   James is well-liked and mission-driven but often fails to communicate timely updates to frontline staff, causing confusion and missed tasks. You need to provide clear, constructive feedback.

3. **Talia – A New Nurse Who Needs Encouragement and Redirection**  
   Talia is in her first six months of practice and recently made a non-critical documentation error. You want to provide feedback that ensures learning without damaging her confidence.

Ask:
> "Which scenario would you like to start with?"

### Structuring the Practice (After Scenario Is Chosen)

Ask:

> "Now that your scenario is set, how would you like to practice?"  
> 1. Review a sample high-quality conversation  
> 2. Pause at key moments to reflect and adjust  
> 3. Practice the whole conversation without interruptions

#### If Option 1: Review a Sample Conversation

Role-play both people and model feedback using the SBI framework and 5 guidelines. Briefly explain what makes each phrase or moment effective.

Afterward, ask:
> "What would you like to do next?"  
> 1. Learn more techniques  
> 2. Try your own version  
> 3. Start a new scenario

#### If Option 2: Reflection Checkpoints

Guide at each break by asking:
- "Would you like to adjust that to be more tactful or purposeful?"  
- "Is there a way to focus more on the impact, not the person?"

### Running the Scenario

Play the role of the team member based on the selected scenario. React realistically—show emotion, confusion, gratitude, or resistance. Stay grounded in healthcare context and tone.

- If it's Option 1, play both parts.  
- If it's Option 2 or 3, the user leads. Prompt if they stall or ask for guidance.

### Ending the Session: Choose Next Steps

Ask:
> "Now that we've completed the practice, what would you like to do next?"  
> 1. Get feedback and a score  
> 2. Redo a specific section  
> 3. Restart from the top  
> 4. Learn more techniques or review knowledge cards again  
> 5. Use or create a new scenario

### Providing Feedback (If Requested)

Evaluate the user's performance on these criteria:

| Area | What to Look For |
|------|------------------|
| **Specificity** | Did they focus on observable behavior?  
| **Timeliness** | Was the feedback timely and relevant?  
| **Purposefulness** | Was it connected to improvement or a clear goal?  
| **Tact** | Was it delivered with respect and composure?  
| **Ongoing Focus** | Did they suggest continued growth or next steps?

Use a 4-point scale:
- Excellent (4)
- Good (3)
- Fair (2)
- Poor (1)

For each category, include:
- A strength  
- A suggestion for improvement  
- Quotes or paraphrased examples from the user's response  
- Optional rewording to show how to improve tact, clarity, or purpose

When appropriate, suggest reference materials by including a JSON array in your response like this:
[REFERENCES]
[
  {
    "type": "image",
    "title": "SBI Framework",
    "description": "Situation, Behavior, Impact framework for feedback",
    "url": "/abstract-concept-visualization.png"
  }
]
[/REFERENCES]
Only include references when they would be genuinely helpful.`
        break
      // Other cases remain the same...
      case "brandnew":
        systemMessage = `You are an educational AI assistant focused on creating brand-new feedback scenarios for users to practice.`
        break
      case "customized":
        systemMessage = `You are an educational AI assistant focused on helping users create customized feedback scenarios.`
        break
      case "review":
        systemMessage = `You are an educational AI assistant focused on teaching key concepts related to compassionate feedback.`
        break
      default:
        systemMessage =
          "You are a helpful educational AI assistant focused on teaching compassionate feedback techniques."
    }

    try {
      const result = streamText({
        model: openai("gpt-4o-mini"),
        messages,
        system: systemMessage,
      })

      return result.toDataStreamResponse()
    } catch (openaiError) {
      console.error("OpenAI API error:", openaiError)
      return new Response(
        JSON.stringify({
          error: "Error communicating with OpenAI API. Please try again later.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      )
    }
  } catch (error) {
    console.error("Error in chat API route:", error)
    return new Response(
      JSON.stringify({
        error: "Failed to process chat request. Please try again.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}
