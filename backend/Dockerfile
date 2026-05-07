# Stage 1: Build
FROM maven:3.9.5-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml .
# Baixa as dependencias para cache
RUN mvn dependency:go-offline -B
# Copia o codigo fonte
COPY src ./src
# Compila e empacota ignorando testes para ser mais rápido
RUN mvn clean package -DskipTests

# Stage 2: Run
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
# Copia apenas o jar final da etapa anterior
COPY --from=builder /app/target/access-control-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
