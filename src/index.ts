// Import required packages
import * as fs from "fs";
import * as path from "path";
import * as restify from "restify";

// This bot's adapter
import adapter from "./adapter";

// This bot's main dialog.
import { StreamingResponse } from "@microsoft/teams-ai";
import { AIEntity } from '@microsoft/teams-ai/lib/types';
import { ConversationReference, TurnContext } from "botbuilder";
import app from "./app/app";
import { CoffeeOrderProcessor, sleep } from "./CoffeeOrderProcessor";

// Create HTTP server.
const server = restify.createServer();
server.use(restify.plugins.bodyParser());

server.listen(process.env.port || process.env.PORT || 3978, () => {
  console.log(`\nBot Started, ${server.name} listening to ${server.url}`);
});

interface SendCardParams {
  card: any;
}

interface Manager {
  userId: string;
  conversationReference: Partial<ConversationReference>;
}

interface OrderProcessors {
  [userId: string]: CoffeeOrderProcessor;
}

const coffeeOrderProcessors: OrderProcessors = {};
let manager: Manager | null = null;

const COFFEE_ORDER_PATTERN = /.*(?=.*order)(?=.*coffee).*/i;

interface SubmitData {
  verb: "confirmOrder" | "cancelOrder";
  lookupId: string;
}

app.adaptiveCards.actionSubmit<SubmitData>(
  "confirmOrder",
  async (context: TurnContext, state: any, data: SubmitData) => {
    console.log("submitAction", data);
    const entity: AIEntity = {
      type: 'https://schema.org/Message',
      '@type': 'Message',
      '@context': 'https://schema.org',
      '@id': '',
      additionalType: ['AIGeneratedContent']
    };

    await context.sendActivity({
      type: 'message',
      text: "Thank you for your approval!",
      entities: [entity]
    });
    const relevantProcessor = coffeeOrderProcessors[data.lookupId];
    if (relevantProcessor) {
      void relevantProcessor.handleUserInput(data.verb).catch((error) => {
        console.error("Error executing current task:", error);
      });
    }
  }
);

app.adaptiveCards.actionSubmit<SubmitData>(
  "confirmOrder",
  async (context: TurnContext, state: any, data: SubmitData) => {
    await context.sendActivity("Order cancelled");
    const relevantProcessor = coffeeOrderProcessors[data.lookupId];
    if (relevantProcessor) {
      void relevantProcessor.handleUserInput(data.verb).catch((error) => {
        console.error("Error executing current task:", error);
      });
    }
  }
);

const commands = [
  "Check Stock Levels",
  "Reorder Essentials",
  "Custom Order Request",
  "Predict Future Needs",
  "Track Order Status",
];

app.message(/.*/, async (context, state) => {
  if (commands.includes(context.activity.text)) {
    if (context.activity.text === "Check Stock Levels") {
      const response = new StreamingResponse(context);

      // Send informative updates
      response.queueInformativeUpdate("Checking stock levels");
      await sleep(1000);
      response.queueInformativeUpdate("Summarizing findings");
      await sleep(2000);

      // Queue the text chunks
      response.queueTextChunk(
        "Here's what I found: you have enough stock for the rest of the month outside of coffee"
      );
      await sleep(500);
      response.queueTextChunk(
        "Here's what I found: you have enough stock for the rest of the month outside of coffee. " +
          "Your coffee stock is down to 10 units and"
      );
      await sleep(500);
      response.queueTextChunk(
        "Here's what I found: you have enough stock for the rest of the month outside of coffee. " +
          "Your coffee stock is down to 10 units and, based on current usage, it's likely to run out by next Wednesday. " +
          "I'd suggest reordering soon to keep things running smoothly! What do you think?"
      );
      response.setFeedbackLoop(true);
      response.setGeneratedByAILabel(true);

      // End the stream
      await response.endStream();
    }
    return;
  }

  const userId = context.activity.from?.aadObjectId;
  if (!userId) return;

  if (context.activity.text === "/registerManager") {
    manager = {
      userId,
      conversationReference: TurnContext.getConversationReference(
        context.activity
      ),
    };

    // Update all existing processors with the new manager
    Object.values(coffeeOrderProcessors).forEach((processor) => {
      processor.setManager(manager!);
    });

    const entity: AIEntity = {
      type: 'https://schema.org/Message',
      '@type': 'Message',
      '@context': 'https://schema.org',
      '@id': '',
      additionalType: ['AIGeneratedContent']
    };

    await context.sendActivity({
      type: 'message',
      text: "You have been registered as the coffee order manager.",
      entities: [entity]
    });
  }

  switch (COFFEE_ORDER_PATTERN.test(context.activity.text)) {
    case true:
      if (
        !coffeeOrderProcessors[userId] ||
        coffeeOrderProcessors[userId].isComplete()
      ) {
        coffeeOrderProcessors[userId] = new CoffeeOrderProcessor(
          context,
          manager
        );
        void coffeeOrderProcessors[userId].executeCurrentTask();
      }
      break;
    default:
      console.log("message", context.activity.text);
      if (coffeeOrderProcessors[userId] && context.activity.text) {
        coffeeOrderProcessors[userId]
          .handleUserInput(context.activity.text)
          .catch((error) => {
            console.error("Error handling user input:", error);
          });
      }
  }
});

// Listen for incoming server requests.
server.post("/api/messages", async (req, res) => {
  // Route received a request to adapter for processing
  await adapter.process(req, res as any, async (context) => {
    // Dispatch to application for routing
    await app.run(context);
  });
});

// API endpoint to get order processor state
server.get("/api/orderState/:userId", (req, res, next) => {
  console.log("orderState", req.params.userId);
  const userId = req.params.userId;
  const processor = coffeeOrderProcessors[userId];

  if (!processor) {
    res.send(404, { error: "No active order found" });
    return next();
  }

  const state = {
    tasks: processor.tasks,
    currentTaskIndex: processor.getCurrentTaskIndex(),
    currentTask: processor.getCurrentTask(),
  };

  res.send(200, state);
  return next();
});

// Serve static HTML for dashboard
server.get("/dashboard", (req, res, next) => {
  fs.readFile(path.join(__dirname, "dashboard.html"), (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end("Error loading dashboard.html");
      return next();
    }

    res.writeHead(200, {
      "Content-Length": Buffer.byteLength(data),
      "Content-Type": "text/html",
    });
    res.write(data);
    res.end();
    return next();
  });
});
