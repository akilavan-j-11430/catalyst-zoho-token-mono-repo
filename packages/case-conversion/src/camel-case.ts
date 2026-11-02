/** A word in ALL CAPS (`ID`, `ROWID`) is read as one lowercase word; any other is kept. */
type Word<Text extends string> = Text extends Uppercase<Text> ? Lowercase<Text> : Text;

type Underscored<Text extends string> = Text extends `${infer Head}-${infer Tail}`
  ? `${Head}_${Underscored<Tail>}`
  : Text;

type JoinedWords<Text extends string> = Text extends `${infer Head}_${infer Tail}`
  ? `${Capitalize<Word<Head>>}${JoinedWords<Tail>}`
  : Capitalize<Word<Text>>;

/** `email_id` -> `emailId`, `x-request-id` -> `xRequestId`, at the type level. */
export type CamelCased<Name extends string> = string extends Name
  ? string
  : Uncapitalize<JoinedWords<Underscored<Name>>>;

/** A value with every object key, at any depth, renamed by `CamelCased`. */
export type CamelCasedKeys<Value> = Value extends readonly (infer Item)[]
  ? CamelCasedKeys<Item>[]
  : Value extends object
    ? { [Key in keyof Value as Key extends string ? CamelCased<Key> : Key]: CamelCasedKeys<Value[Key]> }
    : Value;

/**
 * Renames a vendor's snake_case or kebab-case keys to camelCase, at runtime and in the type,
 * so a seam's mapping function reads the wire shape in our own names. A word with no
 * separator cannot be split: `CREATEDTIME` becomes `createdtime`, so Catalyst table rows
 * are mapped field by field in their repository instead.
 */
export class CamelCase {
  /** `user_id` -> `userId`, `Next-Page-Token` -> `nextPageToken`, `USER_ID` -> `userId`. */
  static convertName<Name extends string>(name: Name): CamelCased<Name> {
    const joinedWords = name
      .split(/[_-]/)
      .map((word) => CamelCase.capitalize(CamelCase.lowerIfAllCaps(word)))
      .join("");
    return (joinedWords.charAt(0).toLowerCase() + joinedWords.slice(1)) as CamelCased<Name>;
  }

  /** Renames the keys of plain objects at any depth, inside arrays too. Other values -
   *  strings, numbers, dates - are returned as they are. */
  static convertKeys<Value>(value: Value): CamelCasedKeys<Value> {
    return CamelCase.convertValue(value) as CamelCasedKeys<Value>;
  }

  private static convertValue(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => CamelCase.convertValue(item));
    }
    if (!CamelCase.isPlainObject(value)) {
      return value;
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        CamelCase.convertName(key),
        CamelCase.convertValue(nestedValue),
      ]),
    );
  }

  private static isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  private static lowerIfAllCaps(word: string): string {
    return word === word.toUpperCase() ? word.toLowerCase() : word;
  }

  private static capitalize(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }
}
