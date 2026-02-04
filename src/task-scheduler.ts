type Task = () => Promise<void>

export default class TaskScheduler {
    private executeFrequency: number;
    private tasks: Task[] 
    private timeout: NodeJS.Timeout | null = null;
    
    public constructor(
        executeFrequency: number,
        ...tasks: Task[]
    ) {
        this.executeFrequency = executeFrequency;
        this.tasks = tasks;
    }
    
    public async start() {
        this.timeout = setInterval(() => {
            this.execute();
        }, this.executeFrequency);

        // Run initial task executions.
        await this.execute();
    }

    public stop() {
        if (this.timeout) {
            clearInterval(this.timeout);
            this.timeout = null;
        }
    }

    public async execute() {
        const promises = this.tasks.map((task) => task());
        await Promise.all(promises);
    }

    public addTasks(...tasks: Task[]) {
        this.tasks.push(...tasks);
    }
}