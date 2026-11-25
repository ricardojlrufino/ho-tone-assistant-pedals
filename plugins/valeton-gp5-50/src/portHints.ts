/** GP-5 e GP-50 (mesmo protocolo, portas distintas); o `(?!\d)` evita que "GP-5" case com "GP-50" e "GP-150". */
export const GP5_NAME_HINT = /gp-?5(?!\d)/i
export const GP50_NAME_HINT = /gp-?50(?!\d)/i
