from selenium import webdriver
from selenium.webdriver.common.by import By
import time

# Inicializar o navegador
driver = webdriver.Chrome()  # Ou Firefox, Edge, etc.
driver.get("https://www2.tjal.jus.br/cpopg/search.do?conversationId=&cbPesquisa=DOCPARTE&dadosConsulta.valorConsulta=45.441.789%2F0001-54&cdForo=-1")

# Espera para garantir que a página carregue
time.sleep(3)

# Exemplo: buscar por todas as tags que possam conter datas
datas = driver.find_elements(By.XPATH, "//*[contains(text(), '17/09/2025')]")

for data in datas:
    # Pegamos o elemento com a data
    print("Data encontrada:", data.text)

    # Pegamos o elemento pai para encontrar o número do processo ao lado
    pai = data.find_element(By.XPATH, "./..")  # Sobe 1 nível na hierarquia
    print("Conteúdo completo:", pai.text)

    # Clica na data (pode abrir nova aba)
    data.click()
    break  # Para após o primeiro resultado
