// server.go
package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/joho/godotenv"
)

var (
	// Ключи, которые сейчас используем
	currentAppId  string
	currentAppKey string

	// Кэш рейсов
	cache struct {
		flightdata interface{}
		updates    interface{}
		lastUpdate int64
	}
	cacheMutex sync.Mutex // это как замок, чтобы два человека не лезли одновременно

	// Красивая страничка с формой
	keysPage = template.Must(template.New("keys").Parse(`
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <title>Ввод ключей DAA</title>
    <style>
        body { font-family: Arial; background: #f0f8ff; padding: 40px; text-align: center; }
        .box { max-width: 500px; margin: auto; background: white; padding: 30px; border-radius: 10px; }
        input { width: 100%; padding: 12px; margin: 10px 0; box-sizing: border-box; }
        button { padding: 15px 40px; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
        #result { margin-top: 20px; padding: 15px; border: 1px solid #ccc; background: #fff; min-height: 100px; }
    </style>
</head>
<body>
    <div class="box">
        <h1>Введи новые ключи DAA</h1>
        <form id="form">
            <input id="app_id" placeholder="app_id" required>
            <input id="app_key" placeholder="app_key" required>
            <button type="submit">Сохранить и проверить</button>
        </form>
        <div id="result">Жду ввода...</div>
    </div>

    <script>
        const form = document.getElementById('form');
        const result = document.getElementById('result');
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const id = document.getElementById('app_id').value.trim();
            const key = document.getElementById('app_key').value.trim();
            result.innerHTML = 'Проверяю...';
            const res = await fetch('/save-keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ app_id: id, app_key: key })
            });
            const data = await res.json();
            if (data.success) {
                result.innerHTML = '<span style="color:green">УСПЕХ! Ключи сохранены и работают</span><br>Теперь можно смотреть рейсы';
            } else {
                result.innerHTML = '<span style="color:red">Ошибка: ' + data.error + '</span>';
            }
        });
    </script>
</body>
</html>
`))
)

func main() {
	// Загружаем .env (если есть)
	godotenv.Load()

	currentAppId = os.Getenv("APP_ID")
	currentAppKey = os.Getenv("APP_KEY")

	log.Println("Старт сервера...")
	log.Println("Ключи из .env: app_id =", ifYesNo(currentAppId), ", app_key =", ifYesNo(currentAppKey))

	if currentAppId != "" && currentAppKey != "" {
		if testKeys(currentAppId, currentAppKey) {
			log.Println("Ключи из .env рабочие — супер!")
		} else {
			log.Println("Ключи из .env НЕ работают — ждём ввода новых")
		}
	}

	// Запускаем обновление кэша каждые 5 минут
	go func() {
		updateCache()
		for range time.Tick(1 * time.Minute) {
			updateCache()
		}
	}()

	// Страницы
	http.HandleFunc("/", homePage)
	http.HandleFunc("/keys", keysPageHandler)
	http.HandleFunc("/save-keys", saveKeysHandler)
	http.HandleFunc("/flightdata", flightdataHandler)
	http.HandleFunc("/updates", updatesHandler)

	log.Println("Сервер на http://localhost:3000")
	log.Println("Если ключи не работают — зайди на /keys")
	http.ListenAndServe(":3000", nil)
}

func ifYesNo(s string) string {
	if s != "" {
		return "есть"
	}
	return "НЕТ"
}

func homePage(w http.ResponseWriter, r *http.Request) {
	status := "Ключи есть"
	if currentAppId == "" || currentAppKey == "" {
		status = "Ключи НЕТ — зайди на /keys"
	}
	fmt.Fprintf(w, `
		<h1>GOPS бэкенд ✈️</h1>
		<p>Статус ключей: %s</p>
		<p><a href="/keys">Ввести/изменить app_id и app_key</a></p>
		<p><a href="/flightdata">Смотреть рейсы</a> | <a href="/updates">Смотреть обновления</a></p>
	`, status)
}

func keysPageHandler(w http.ResponseWriter, r *http.Request) {
	keysPage.Execute(w, nil)
}

func saveKeysHandler(w http.ResponseWriter, r *http.Request) {
	body, _ := io.ReadAll(r.Body)
	var data struct {
		AppId  string `json:"app_id"`
		AppKey string `json:"app_key"`
	}
	json.Unmarshal(body, &data)

	if data.AppId == "" || data.AppKey == "" {
		json.NewEncoder(w).Encode(map[string]any{"success": false, "error": "Введи оба поля"})
		return
	}

	currentAppId = data.AppId
	currentAppKey = data.AppKey

	log.Println("Новые ключи сохранены:", data.AppId[:4]+"...")

	if testKeys(currentAppId, currentAppKey) {
		updateCache() // сразу обновим данные с новыми ключами
		json.NewEncoder(w).Encode(map[string]any{"success": true})
	} else {
		json.NewEncoder(w).Encode(map[string]any{"success": false, "error": "Ключи НЕ работают"})
	}
}

func testKeys(id, key string) bool {
	client := &http.Client{Timeout: 8 * time.Second}
	req, _ := http.NewRequest("GET", "https://api.daa.ie/dub/aops/flightdata/operational/v1/carrier/EI", nil)
	req.Header.Set("app_id", id)
	req.Header.Set("app_key", key)
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		log.Println("Ошибка запроса в testKeys:", err)
		return false
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	log.Printf("testKeys статус: %d | тело: %s", resp.StatusCode, string(body))

	return resp.StatusCode == 200
}

func fetchDAA(endpoint string) (interface{}, error) {
	if currentAppId == "" || currentAppKey == "" {
		return nil, fmt.Errorf("Нет ключей")
	}
	url := "https://api.daa.ie/dub/aops/flightdata/operational/v1" + endpoint
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("app_id", currentAppId)
	req.Header.Set("app_key", currentAppKey)
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	log.Printf("fetchDAA статус: %d для %s", resp.StatusCode, endpoint)

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("Ошибка от DAA: %s", string(body))
		return nil, fmt.Errorf("DAA вернул %d", resp.StatusCode)
	}

	var result interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}

func updateCache() {
	flightdata, err1 := fetchDAA("/carrier/EI,BA,IB,VY,I2,AA,T2")
	updates, err2 := fetchDAA("/updates/carrier/EI,BA,IB,VY,I2,AA,T2")

	cacheMutex.Lock()
	defer cacheMutex.Unlock()

	if err1 == nil {
		cache.flightdata = flightdata
	}
	if err2 == nil {
		cache.updates = updates
	}
	if err1 == nil || err2 == nil {
		cache.lastUpdate = time.Now().Unix()
		log.Println("Кэш обновлён")
	}
}

func flightdataHandler(w http.ResponseWriter, r *http.Request) {
	cacheMutex.Lock()
	data := cache.flightdata
	cacheMutex.Unlock()

	if data == nil {
		updateCache()
		cacheMutex.Lock()
		data = cache.flightdata
		cacheMutex.Unlock()
	}

	if data == nil {
		http.Error(w, "Не могу получить данные — проверь ключи", 500)
		return
	}
	json.NewEncoder(w).Encode(data)
}

func updatesHandler(w http.ResponseWriter, r *http.Request) {
	cacheMutex.Lock()
	data := cache.updates
	cacheMutex.Unlock()

	if data == nil {
		updateCache()
		cacheMutex.Lock()
		data = cache.updates
		cacheMutex.Unlock()
	}

	if data == nil {
		http.Error(w, "Не могу получить данные — проверь ключи", 500)
		return
	}
	json.NewEncoder(w).Encode(data)
}
