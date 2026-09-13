/** Available in every runtime we target (Node 17+, workerd, browsers); not in lib.es2022. */
declare function structuredClone<T>(value: T): T;
