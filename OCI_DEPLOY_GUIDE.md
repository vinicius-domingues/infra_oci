# Guia de Deploy OCI (1GB RAM) & Conexão SSH / Banco de Dados

Este guia detalha o passo a passo para colocar a aplicação em produção em uma instância Always Free da Oracle Cloud Infrastructure (OCI) e configurar a conexão e o banco de dados de maneira otimizada e segura.

---

## 1. Acessando a Instância via SSH

Quando você cria uma instância VM na OCI, você baixa uma chave privada (geralmente `ssh-key-YYYY-MM-DD.key`).

### Como conectar do seu computador local:
No seu terminal local (PowerShell, Bash ou CMD):
```bash
# 1. Defina as permissões corretas para a chave privada (no Linux/Mac)
chmod 400 sua_chave.key

# 2. Conecte à instância (o usuário padrão para Ubuntu é 'ubuntu', para Oracle Linux é 'opc')
ssh -i /caminho/para/sua_chave.key ubuntu@<IP_PUBLICO_DA_VM>
```

---

## 2. Preparando a VM (1GB RAM)

Instâncias com 1GB de RAM podem sofrer travamentos se o uso de memória estourar durante o `npm install` ou build.
**Dica de Ouro:** Crie um arquivo de Swap (memória virtual) de 1GB ou 2GB.

```bash
# Criar arquivo de swap de 2GB
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Tornar permanente
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Instalar Node.js & Git:
```bash
sudo apt update
sudo apt install -y nodejs npm git
```

---

## 3. Rodando o Projeto com PM2
Para manter seu servidor rodando continuamente sem bloquear o terminal:
```bash
sudo npm install -g pm2

# Clone o repositório
git clone <URL_DO_SEU_REPOSITORIO>
cd infra_oci

# Instale as dependências
npm install --production

# Inicie o processo com PM2
pm2 start server.js --name "crud-latency-api"

# Configure para reiniciar automaticamente com o sistema
pm2 startup
pm2 save
```

---

## 4. Otimizando Índices no MySQL para o Futuro
À medida que a tabela de clientes cresce, as buscas por `email` ou `name` (como no nosso campo de busca) farão "Table Scans" completos, o que degradará a latência (aumentando os `ms` mostrados na tela).

No MySQL, você pode adicionar índices rapidamente:

```sql
-- Criar um índice para busca rápida e única por e-mail (busca exata)
CREATE UNIQUE INDEX idx_clients_email ON clients(email);

-- Criar um índice comum para buscas pelo nome do cliente
CREATE INDEX idx_clients_name ON clients(name);
```
No MySQL, isso otimiza buscas usando `SELECT * FROM clients WHERE email = ?` ou `WHERE name LIKE '?'` permitindo acesso direto em árvore B+ (B-Tree), reduzindo tempos de resposta significativamente.

---

## 5. Conectando/Instalando o MySQL no Servidor OCI

Se você decidir migrar do SQLite local para o **MySQL** hospedado na própria VM da OCI:

### 5.1 Instalar MySQL Server na VM:
```bash
sudo apt update
sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql
```

### 5.2 Criar Banco de Dados, Usuário e Liberar Acesso Local:
Execute o MySQL como root:
```bash
sudo mysql
```

Dentro do prompt do MySQL, execute as seguintes queries:
```sql
-- Criar o banco de dados
CREATE DATABASE IF NOT EXISTS crud_db;

-- Criar o usuário para acesso local (seguro)
CREATE USER 'dbuser'@'localhost' IDENTIFIED BY '123';

-- Dar permissões totais no banco para o usuário
GRANT ALL PRIVILEGES ON crud_db.* TO 'dbuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 6. Conectando com Segurança via SSH Tunnel (Sem expor a porta 3306 publicamente)

Por segurança, **não abra** a porta `3306` do MySQL nas "Ingress Rules" (Security List) da OCI. Em vez disso, use um **Túnel SSH** para conectar ferramentas como **DBeaver**, **MySQL Workbench** ou VS Code de forma criptografada.

Do seu terminal no computador local, execute:
```bash
# Redireciona a porta 3306 do servidor remoto OCI para a porta 3306 no seu localhost
ssh -L 3306:localhost:3306 -i C:\Users\vinii\Downloads\ssh-key-2026-08-22 (1).key ubuntu@<140.238.180.128>
```

Agora, no seu DBeaver/Workbench local, basta configurar a conexão para:
- **Host**: `127.0.0.1` (ou `localhost`)
- **Porta**: `3306`
- **Database**: `crud_db`
- **Username**: `dbuser`
- **Password**: `suasenhamuitosegura`

Toda a comunicação passará de forma segura por dentro do canal SSH criptografado diretamente para a sua instância OCI!

