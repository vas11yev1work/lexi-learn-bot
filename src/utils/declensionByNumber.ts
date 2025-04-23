export function declensionByNumber(number: number, wordForms: string[]) {
  // Получаем последние две цифры числа
  const lastTwoDigits = Math.abs(number) % 100;
  // Получаем последнюю цифру числа
  const lastDigit = lastTwoDigits % 10;

  // Особый случай: числа от 11 до 19
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return wordForms[2]; // Родительный падеж множественного числа (5-20)
  }

  // Для чисел, оканчивающихся на 1 (кроме 11)
  if (lastDigit === 1) {
    return wordForms[0]; // Именительный падеж единственного числа
  }

  // Для чисел, оканчивающихся на 2, 3, 4 (кроме 12-14)
  if (lastDigit >= 2 && lastDigit <= 4) {
    return wordForms[1]; // Родительный падеж единственного числа (2-4)
  }

  // Для всех остальных чисел (0, 5-9)
  return wordForms[2]; // Родительный падеж множественного числа (5-20)
}
