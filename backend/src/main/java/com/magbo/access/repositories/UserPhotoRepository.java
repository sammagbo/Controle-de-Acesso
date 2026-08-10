package com.magbo.access.repositories;

import com.magbo.access.models.UserPhoto;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface UserPhotoRepository extends JpaRepository<UserPhoto, String> {

    /**
     * Quem JA tem foto, e com que conteudo — SEM trazer os bytes.
     *
     * A distincao nao e cosmetica. O plano de importacao precisa responder duas
     * perguntas para cada arquivo ("esta pessoa ja tem foto?" e "e a mesma?"),
     * e um findAllById normal traria ~25MB de imagem para o heap so para
     * comparar hashes. Com a projecao, um import de 1200 arquivos le alguns
     * kilobytes de metadado.
     */
    @Query("SELECT p.userId AS userId, p.sha256 AS sha256, p.byteSize AS byteSize "
            + "FROM UserPhoto p WHERE p.userId IN :ids")
    List<PhotoMeta> findMetaByUserIdIn(@Param("ids") Collection<String> ids);

    /** Metadado da foto, sem os bytes. Projecao de interface do Spring Data. */
    interface PhotoMeta {
        String getUserId();
        String getSha256();
        Integer getByteSize();
    }

    /**
     * Ids de quem tem foto, dentro de um conjunto — alimenta as telas que
     * precisam saber se ha retrato antes de tentar buscá-lo.
     */
    @Query("SELECT p.userId FROM UserPhoto p WHERE p.userId IN :ids")
    List<String> findUserIdsWithPhoto(@Param("ids") Collection<String> ids);
}
