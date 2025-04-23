import type { QuestionTask } from '@/types/question.js';
import { DefinitionTask } from './definitionTask.js';
import { ChoiceTask } from '@/tasks/choiceTask.js';

export class TaskFactory {
  private static tasks: Map<string, QuestionTask> = new Map();

  // Регистрируем все типы заданий
  static initialize() {
    this.registerTask(new DefinitionTask());
    this.registerTask(new ChoiceTask());
    // В будущем здесь можно зарегистрировать новые типы заданий
  }

  // Регистрация нового типа задания
  static registerTask(task: QuestionTask) {
    this.tasks.set(task.type, task);
  }

  // Получение задания по типу
  static getTask(type: string): QuestionTask | undefined {
    return this.tasks.get(type);
  }

  // Получение всех типов заданий
  static getAllTaskTypes(): string[] {
    return Array.from(this.tasks.keys());
  }
}
