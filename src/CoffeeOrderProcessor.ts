import { StreamingResponse } from "@microsoft/teams-ai";
import { AIEntity, ClientCitation } from "@microsoft/teams-ai/lib/types";
import {
  Activity,
  CloudAdapter,
  ConversationReference,
  TurnContext,
} from "botbuilder";
import * as readline from "readline";
import { Task, coffeeTasks } from "./Tasks";

interface TaskWithProgress extends Task {
  progress: number;
  userInput?: string;
}

interface Manager {
  userId: string;
  conversationReference: Partial<ConversationReference>;
}

export const sleep = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class CoffeeOrderProcessor {
  private currentTaskIndex: number = 0;
  private _tasks: TaskWithProgress[];
  private conversationReference: Partial<ConversationReference>;
  private adapter: CloudAdapter;
  private manager: Manager | null;

  constructor(context: TurnContext, manager: Manager | null = null) {
    this._tasks = coffeeTasks.map((task) => ({
      ...task,
      progress: 0,
    }));

    this.conversationReference = TurnContext.getConversationReference(
      context.activity
    );
    this.adapter = context.adapter as CloudAdapter;
    this.manager = manager;
  }

  public setManager(manager: Manager): void {
    this.manager = manager;
  }

  private async sendProactiveMessage(
    message: string,
    toManager: boolean = false
  ): Promise<void> {
    const reference =
      toManager && this.manager
        ? (this.manager.conversationReference as ConversationReference)
        : (this.conversationReference as ConversationReference);

    const entity: AIEntity = {
      type: "https://schema.org/Message",
      "@type": "Message",
      "@context": "https://schema.org",
      "@id": "",
      additionalType: ["AIGeneratedContent"],
    };

    const activity: Partial<Activity> = {
      type: "message",
      text: message,
      entities: [entity],
    };

    await this.adapter.continueConversationAsync(
      process.env.BOT_ID!,
      reference,
      async (context) => {
        await context.sendActivity(activity);
      }
    );
  }

  private async simulateProgress(task: TaskWithProgress): Promise<void> {
    const waitTime = task.waitTime || 0;
    const updateInterval = 1000;
    task.progress = 0;

    if (task.taskName === "Calculate Required Stock") {
      await this.adapter.continueConversationAsync(
        process.env.BOT_ID!,
        this.conversationReference as ConversationReference,
        async (context) => {
          const response = new StreamingResponse(context);

          // Send informative updates
          response.queueInformativeUpdate(
            "Reading through the reorder process"
          );
          await sleep(1000);

          response.queueInformativeUpdate("Thinking through how to reorder");
          await sleep(1000);

          const url = `https://teams.microsoft.com/l/entity/${process.env.TEAMS_APP_ID}/dashboard?webUrl=${process.env.BOT_ENDPOINT}/dashboard`;
          console.log("URL for adaptive card:", url);
          const adaptiveCard = {
            type: "AdaptiveCard",
            $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                wrap: true,
                text: "I'll sort out the details and get everything ready to reorder. I'll keep you updated along the way! You can follow my progress through the dashboard",
              },
              {
                type: "ActionSet",
                actions: [
                  {
                    type: "Action.OpenUrl",
                    title: "Track Progress",
                    iconUrl: "icon:ArrowClockwise",
                    url: url,
                  },
                ],
              },
            ],
          };

          // Queue the adaptive card
          response.queueTextChunk("Sure! Let me handle that for you");
          response.setAttachments([
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: adaptiveCard,
            },
          ]);

          // Set AI label and end the stream
          response.setGeneratedByAILabel(true);
          await response.endStream();
        }
      );

      task.taskStatus = "completed";
      this.moveToNextTask();
      void this.executeCurrentTask();
      return;
    }

    while (task.progress < 100) {
      task.progress += Math.floor(Math.random() * 15) + 10;
      task.progress = Math.min(task.progress, 100);

      // Add console pause at 50%
      if (
        task.taskName === "Check Supplier Inventory" &&
        task.progress >= 50 &&
        task.progress < 75 &&
        !task.userInput
      ) {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        await new Promise<void>((resolve) => {
          rl.question("Press Enter to continue...", () => {
            rl.close();
            resolve();
          });
        });
        task.progress = 75;

        console.log("Continuing progress...");
      }

      // Existing supplier change question at 75%
      if (
        task.taskName === "Check Supplier Inventory" &&
        task.progress >= 75 &&
        task.taskStatus !== "waitingForUserInput" &&
        !task.userInput
      ) {
        task.taskStatus = "waitingForUserInput";
        task.userInput = undefined; // Reset userInput for the 75% check

        const citation: ClientCitation = {
          "@type": "Claim",
          position: "1",
          appearance: {
            "@type": "DigitalDocument",
            name: "Approved Coffee Bean Suppliers",
            abstract:
              "The approved suppliers for coffee inventory, including Tailwind Traders Inc., known for their premium roasted blends, and Fourth Coffee Ltd., recognized for their reliable delivery and competitive pricing",
            keywords: ["inventory", "updated 2024"],
          },
        };

        const entity: AIEntity = {
          type: "https://schema.org/Message",
          "@type": "Message",
          "@context": "https://schema.org",
          "@id": "",
          additionalType: ["AIGeneratedContent"],
          citation: [citation],
        };

        const activity: Partial<Activity> = {
          type: "message",
          text: "Quick Question: Unfortunately, Tailwind Traders Inc. won't be able to deliver the coffee on time. However, Fourth Coffee Ltd., [1] who's also on the approved supplier list, can step in and meet the timeline. Shall I proceed with Fourth Coffee? Let me know!",
          entities: [entity],
        };

        await this.adapter.continueConversationAsync(
          process.env.BOT_ID!,
          this.conversationReference as ConversationReference,
          async (context) => {
            await context.sendActivity(activity);
          }
        );
        return;
      }

      if (task.progress < 100) {
        await sleep(updateInterval);
      }

      if (task.progress >= 100) {
        task.taskStatus = "completed";

        if (task.taskName === "Place Order") {
          const orderSummaryCard = {
            type: "AdaptiveCard",
            $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "Order Successfully Placed! 🎉",
                weight: "Bolder",
                size: "Large",
                spacing: "Medium",
              },
              {
                type: "TextBlock",
                text: "Here's a summary of your order:",
                wrap: true,
                spacing: "Medium",
              },
              {
                type: "FactSet",
                facts: [
                  { title: "Item:", value: "Coffee" },
                  { title: "Supplier:", value: "Fourth Coffee Ltd." },
                  { title: "Quantity:", value: "30 units" },
                  { title: "Price per Unit:", value: "$10" },
                  { title: "Total Cost:", value: "$300" },
                  { title: "Expected Delivery:", value: "November 20, 2024" },
                  { title: "Order Status:", value: "Confirmed" },
                ],
              },
              {
                type: "TextBlock",
                text: "Thank you for your order! You'll receive updates as your order progresses.",
                wrap: true,
                spacing: "Medium",
              },
            ],
          };

          await this.adapter.continueConversationAsync(
            process.env.BOT_ID!,
            this.conversationReference as ConversationReference,
            async (context) => {
              await context.sendActivity({
                attachments: [
                  {
                    contentType: "application/vnd.microsoft.card.adaptive",
                    content: orderSummaryCard,
                  },
                ],
              });
            }
          );
        }

        this.moveToNextTask();
        void this.executeCurrentTask();
      }
    }

    const remainingTime =
      waitTime - Math.floor(waitTime / updateInterval) * updateInterval;
    if (remainingTime > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingTime));
    }
  }

  public async executeCurrentTask(): Promise<void> {
    const currentTask = this._tasks[this.currentTaskIndex];

    if (!currentTask) {
      return;
    }

    currentTask.taskStatus = "started";

    if (currentTask.taskType === "independent") {
      if (currentTask.waitTime) {
        await this.simulateProgress(currentTask);
      }
    } else if (currentTask.taskType === "requiresManagerApproval") {
      currentTask.taskStatus = "waitingForUserInput";

      if (currentTask.taskName === "Get Finance Approval") {
        const adaptiveCard = {
          type: "AdaptiveCard",
          version: "1.5",
          body: [
            {
              type: "TextBlock",
              text: "Purchase Order Summary",
              weight: "Bolder",
              size: "Large",
              spacing: "Medium",
            },
            {
              type: "FactSet",
              facts: [
                { title: "Item:", value: "Coffee" },
                { title: "Supplier:", value: "Fourth Coffee Ltd." },
                { title: "Quantity:", value: "30 units" },
                { title: "Price per Unit:", value: "$10" },
                { title: "Total Cost:", value: "$300" },
                { title: "Expected Delivery:", value: "November 20, 2024" },
              ],
            },
            {
              type: "TextBlock",
              text: "Please confirm if you'd like to proceed with this order.",
              wrap: true,
              spacing: "Medium",
            },
          ],
          actions: [
            {
              type: "Action.Submit",
              title: "Confirm Order",
              data: {
                verb: "confirmOrder",
                lookupId: this.conversationReference.user.aadObjectId,
              },
              iconUrl: "icon:Checkmark",
            },
            {
              type: "Action.Submit",
              title: "Cancel Order",
              data: {
                verb: "cancelOrder",
                lookupId: this.conversationReference.user.aadObjectId,
              },
              iconUrl: "icon:Dismiss",
            },
          ],
          msTeams: { width: "full" },
          $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
        };

        await this.adapter.continueConversationAsync(
          process.env.BOT_ID!,
          this.manager?.conversationReference as ConversationReference,
          async (context) => {
            const entity: AIEntity = {
              type: "https://schema.org/Message",
              "@type": "Message",
              "@context": "https://schema.org",
              "@id": "",
              additionalType: ["AIGeneratedContent"],
            };

            await context.sendActivity({
              type: "message",
              text: "Hi, we need to restock on coffee and need your approval on the purchase order",
              entities: [entity],
            });
            await context.sendActivity({
              attachments: [
                {
                  contentType: "application/vnd.microsoft.card.adaptive",
                  content: adaptiveCard,
                },
              ],
            });
          }
        );
      }
    } else {
      currentTask.taskStatus = "waitingForUserInput";

      switch (currentTask.taskName) {
        case "Coffee Selection":
          await this.sendProactiveMessage(
            "What type of coffee would you like? (Espresso, Latte, Americano)"
          );
          break;
        case "Order Summary":
          await this.sendProactiveMessage(
            "Here is your order summary. Would you like to proceed? (Yes/No)"
          );
          break;
        case "Check Supplier Inventory":
          await this.sendProactiveMessage(
            "Quick Question: Unfortunately, Tailwind Traders Inc. won't be able to deliver the coffee on time. " +
              "However, Fourth Coffee Ltd., [1] who's also on the approved supplier list, can step in and meet the timeline. " +
              "Shall I proceed with Fourth Coffee? Let me know!\n\n" +
              "Citation:\n\n" +
              'Title: "Approved Coffee Bean Suppliers"\n\n' +
              'Metadata: "inventory", "updated 2024"\n\n' +
              'Abstract: "the approved suppliers for coffee inventory, including Tailwind Traders Inc., known for their premium roasted blends, ' +
              'and Fourth Coffee Ltd., recognized for their reliable delivery and competitive pricing"'
          );
          break;
        default:
          await this.sendProactiveMessage(
            "Please provide your input to continue."
          );
      }
    }
  }

  public getTaskProgress(taskIndex: number): number {
    return this._tasks[taskIndex]?.progress || 0;
  }

  public getCurrentTaskProgress(): number {
    return this.getTaskProgress(this.currentTaskIndex);
  }

  public getCurrentTask(): TaskWithProgress {
    return this._tasks[this.currentTaskIndex];
  }

  public moveToNextTask(): void {
    const currentTask = this._tasks[this.currentTaskIndex];
    this.currentTaskIndex++;
    const nextTask = this._tasks.at(this.currentTaskIndex);
    console.log(
      "Moving from ",
      currentTask?.taskName,
      "to",
      nextTask?.taskName
    );
  }

  public isComplete(): boolean {
    return this.currentTaskIndex >= this._tasks.length;
  }

  public async handleUserInput(input: string): Promise<void> {
    const currentTask = this._tasks[this.currentTaskIndex];

    if (
      currentTask?.taskStatus !== "waitingForUserInput" ||
      currentTask.userInput
    ) {
      return;
    }

    if (currentTask.taskType === "requiresManagerApproval") {
      if (this.manager?.userId === input || input.includes("confirmOrder")) {
        await this.sendProactiveMessage("Purchase order has been approved!");
        currentTask.taskStatus = "completed";
        this.moveToNextTask();
        void this.executeCurrentTask();
      } else if (input.includes("cancelOrder")) {
        await this.sendProactiveMessage("Purchase order has been rejected.");
      }
      return;
    }

    if (
      currentTask.taskName === "Order Summary" &&
      this.manager?.userId === input
    ) {
      await this.sendProactiveMessage(`Order approved by manager`, false);
      currentTask.taskStatus = "completed";
      this.moveToNextTask();
      void this.executeCurrentTask();
      return;
    }

    switch (currentTask.taskName) {
      case "Coffee Selection":
        const validCoffeeTypes = ["espresso", "latte", "americano"];
        if (validCoffeeTypes.includes(input.toLowerCase())) {
          currentTask.userInput = input;
          await this.sendProactiveMessage(
            `Great choice! You selected: ${input}`
          );
          currentTask.taskStatus = "completed";
          this.moveToNextTask();
          void this.executeCurrentTask();
        } else {
          await this.sendProactiveMessage(
            "Please select a valid coffee type (Espresso, Latte, Americano)"
          );
        }
        break;

      case "Order Summary":
        if (this.manager) {
          await this.sendProactiveMessage(
            `New coffee order requires approval from ${this.conversationReference.user?.name}. Type 'approve' to confirm.`,
            true
          );
          await this.sendProactiveMessage("Waiting for manager approval...");
        } else {
          if (input.toLowerCase() === "yes") {
            await this.sendProactiveMessage(
              "Order confirmed! Processing your order..."
            );
            currentTask.taskStatus = "completed";
            this.moveToNextTask();
            void this.executeCurrentTask();
          } else if (input.toLowerCase() === "no") {
            await this.sendProactiveMessage(
              "Order cancelled. Feel free to start a new order."
            );
          } else {
            await this.sendProactiveMessage("Please respond with Yes or No");
          }
        }
        break;

      case "Check Supplier Inventory":
        if (input.toLowerCase().includes("yes")) {
          currentTask.userInput = input;
          await this.sendProactiveMessage(
            "Great! I'll proceed with Fourth Coffee Ltd. for this order."
          );
          currentTask.taskStatus = "started";
          void this.simulateProgress(currentTask);
        } else if (input.toLowerCase().includes("no")) {
          currentTask.userInput = input;
          await this.sendProactiveMessage(
            "I understand. I'll look for alternative solutions."
          );
          currentTask.taskStatus = "started";
          void this.simulateProgress(currentTask);
        } else {
          await this.sendProactiveMessage("Please respond with Yes or No");
        }
        break;

      default:
        await this.sendProactiveMessage("Unexpected input state");
    }
  }

  public getCurrentTaskIndex(): number {
    return this.currentTaskIndex;
  }

  public get tasks(): TaskWithProgress[] {
    return this._tasks;
  }
}
