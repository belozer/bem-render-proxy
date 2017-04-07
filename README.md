bem-render-proxy
==================

Позволяет связать проект на bemtree - bemhtml c бекендом на любом языке программирования.

Можно получить разный результат в зависимости от переменных окружения и переданных параметров.

## Параметры запроса
 Во режиме разработки следующие параметры можно передать в GET запросе.
 
 * `json` - Отдать переданный бэкендом json без преобразований
 * `bemjson` - Применить BEMTREE шаблоны, но не применять bemhtml
 * `rebuild` - Пересобрать бандл перед подключением шаблонов

Пример:
Следующий запрос пересоберет страницу /cart и вернет результат BEMTREE

```
    GET myproject.dev/cart?rebuild=1&bemjson=1
```