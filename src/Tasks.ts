export type TaskType = 'independent' | 'requiresInput' | 'requiresManagerApproval';
export type TaskStatus = 'notStarted' | 'started' | 'waitingForUserInput' | 'completed';

export interface Task {
  taskName: string;
  taskType: TaskType;
  taskStatus: TaskStatus;
  description: string;
  waitTime?: number;
}

const getRandomWaitTime = (min: number = 30000, max: number = 40000): number => {
  return Math.floor(Math.random() * (max - min) + min);
};

export const coffeeTasks: Task[] = [
  {
    taskName: 'Calculate Required Stock',
    taskType: 'independent',
    taskStatus: 'notStarted',
    description: 'AI is calculating the required stock',
    waitTime: 3000  // 3 seconds to allow for streaming
  },
  {
    taskName: 'Check Supplier Inventory',
    taskType: 'independent',
    taskStatus: 'notStarted',
    description: 'Confirming with the supplier that the required quantity is in stock and verifying pricing and delivery timelines.',
    waitTime: 10_000
  },
  {
    taskName: 'Prepare Order Summary',
    taskType: 'independent',
    taskStatus: 'notStarted',
    description: 'AI is preparing the order summary',
    waitTime: getRandomWaitTime()
  },
  {
    taskName: 'Get Finance Approval',
    taskType: 'requiresManagerApproval',
    taskStatus: 'notStarted',
    description: 'Present order details and get customer confirmation',
  },
  {
    taskName: 'Place Order',
    taskType: 'independent',
    taskStatus: 'notStarted',
    description: 'Submit the order to the coffee shop system',
    waitTime: 2000
  },
]; 